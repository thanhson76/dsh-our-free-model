#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};

pub struct ServiceProcess {
    child: Child,
    data_dir: PathBuf,
    pub management_url: String,
}

// The handshake comes only from our own stdout pipe; whoever occupies a port, or a ready file in a shared directory, is not trusted.
fn ready_address(value: &serde_json::Value, pid: u32) -> Result<String, String> {
    if value["protocol"] == "ofm-desktop-error/v1" {
        return Err(if value["code"] == "DATA_DIRECTORY_IN_USE" {
            "The data directory is already in use by a service; stop the existing standalone service first. Its lock file will not be deleted"
        } else {
            "The backend service failed to start; check the install resources and the data directory permissions"
        }
        .into());
    }
    let address = value["managementUrl"]
        .as_str()
        .ok_or("The service handshake is missing the management address")?;
    let url: tauri::Url = address.parse().map_err(|_| "Invalid service handshake address")?;
    let token = url
        .fragment()
        .and_then(|fragment| fragment.strip_prefix("login="))
        .ok_or("The service handshake is missing the login entry point")?;
    if value["protocol"] != "ofm-desktop-ready/v1"
        || value["product"] != "our-free-model-standalone"
        || value["pid"].as_u64() != Some(pid as u64)
        || value["port"].as_u64() != url.port_or_known_default().map(u64::from)
        || url.port_or_known_default() == Some(0)
        || url.scheme() != "http"
        || url.host_str() != Some("127.0.0.1")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || token.len() != 43
        || !token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        return Err("Service handshake validation failed".into());
    }
    Ok(address.to_owned())
}

impl ServiceProcess {
    pub fn start(node: &Path, host: &Path, data_dir: &Path) -> Result<Self, String> {
        let data_dir = if data_dir.is_absolute() {
            data_dir.to_owned()
        } else {
            std::env::current_dir()
                .map_err(|_| "Cannot determine the data directory")?
                .join(data_dir)
        };
        let mut command = Command::new(node);
        command
            // Tauri resource paths are canonicalized, and on Windows they carry the \\?\ prefix.
            // Node cannot take such a path as its main-module argument; start it with the working directory and file name.
            .current_dir(host.parent().ok_or("Invalid service entry directory")?)
            .arg(host.file_name().ok_or("Invalid service entry file name")?)
            .arg("--data-dir")
            .arg(&data_dir)
            .env_remove("NODE_OPTIONS")
            .env_remove("NODE_PATH")
            .env("OFM_DESKTOP_VERSION", env!("CARGO_PKG_VERSION"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let child = command.spawn().map_err(|_| "Cannot start the bundled Node service")?;
        let mut process = Self {
            child,
            data_dir: data_dir.to_owned(),
            management_url: String::new(),
        };
        let output = process.child.stdout.take().ok_or("Cannot read the service handshake")?;
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            // Keep draining the pipe so third-party logs after the handshake cannot block the service; the logs never reach the page.
            for line in BufReader::new(output).lines().map_while(Result::ok) {
                if line.len() > 4096 {
                    continue;
                }
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                    if matches!(
                        value["protocol"].as_str(),
                        Some("ofm-desktop-ready/v1" | "ofm-desktop-error/v1")
                    ) {
                        let _ = sender.send(value);
                    }
                }
            }
        });
        let deadline = Instant::now() + Duration::from_secs(30);
        let result = loop {
            match receiver.recv_timeout(Duration::from_millis(100)) {
                Ok(value) => break ready_address(&value, process.child.id()),
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    break Err("The service process did not complete the startup handshake".into())
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            if process
                .child
                .try_wait()
                .map_err(|_| "Cannot check the service process")?
                .is_some()
            {
                break Err("The service process exited during startup".into());
            }
            if Instant::now() >= deadline {
                break Err("The service startup handshake timed out".into());
            }
        };
        process.management_url = result?;
        Ok(process)
    }

    pub fn stop(&mut self) {
        if let Some(mut input) = self.child.stdin.take() {
            let _ = input.write_all(b"shutdown\n");
            let _ = input.flush();
        }
        let deadline = Instant::now() + Duration::from_secs(8);
        let stopped = loop {
            match self.child.try_wait() {
                Ok(Some(_)) => break true,
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(50))
                }
                _ => {
                    let _ = self.child.kill();
                    break self.child.wait().is_ok();
                }
            }
        };
        // After a timed-out force stop, only reclaim the lock left by our own stopped process; never delete blindly by port or directory.
        if stopped {
            let lock = self.data_dir.join("service.lock");
            if let Ok(bytes) = fs::read(&lock) {
                if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                    if value["pid"].as_u64() == Some(self.child.id() as u64)
                        && value["product"] == "our-free-model-standalone"
                    {
                        let _ = fs::remove_file(lock);
                    }
                }
            }
        }
    }

    pub fn data_dir(&self) -> &Path { &self.data_dir }
}

impl Drop for ServiceProcess {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ready() -> serde_json::Value {
        serde_json::json!({ "protocol":"ofm-desktop-ready/v1", "product":"our-free-model-standalone", "pid":42, "port":12345, "managementUrl":format!("http://127.0.0.1:12345/#login={}", "a".repeat(43)) })
    }
    #[test]
    fn accepts_actual_port_and_rejects_foreign_identity() {
        assert!(ready_address(&ready(), 42).is_ok());
        let mut default_port = ready();
        default_port["port"] = 80.into();
        default_port["managementUrl"] =
            format!("http://127.0.0.1:80/#login={}", "a".repeat(43)).into();
        assert!(ready_address(&default_port, 42).is_ok());
        assert!(ready_address(&ready(), 43).is_err());
        let mut wrong = ready();
        wrong["port"] = 18900.into();
        assert!(ready_address(&wrong, 42).is_err());
    }
    #[test]
    fn rejects_external_or_missing_login_address() {
        for url in [
            "https://evil.example/#login=a",
            "http://127.0.0.1:12345/",
            "http://127.0.0.1:12345/#login=a",
        ] {
            let mut wrong = ready();
            wrong["managementUrl"] = url.into();
            assert!(ready_address(&wrong, 42).is_err());
        }
    }

    #[cfg(windows)]
    #[test]
    fn starts_from_canonical_windows_path_with_spaces_and_unicode() {
        let directory =
            std::env::temp_dir().join(format!("ofm 桌面入口测试 {}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let host = directory.join("service host.mjs");
        fs::write(&host, r#"
            process.stdout.write(JSON.stringify({protocol:'ofm-desktop-ready/v1',product:'our-free-model-standalone',pid:process.pid,port:12345,managementUrl:'http://127.0.0.1:12345/#login='+'a'.repeat(43)})+'\n');
            process.stdin.on('data', () => process.exit(0));
            process.stdin.on('end', () => process.exit(0));
        "#).unwrap();
        let node = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/runtime/node.exe")
            .canonicalize()
            .unwrap();
        let result = ServiceProcess::start(
            &node,
            &host.canonicalize().unwrap(),
            &directory.join("data"),
        );
        let success = result.is_ok();
        drop(result);
        fs::remove_dir_all(directory).unwrap();
        assert!(success, "A Windows canonicalized path should be able to start the Node main module");
    }
}
