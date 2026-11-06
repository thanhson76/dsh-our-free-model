# Standalone service local portable package

## Goals and assumptions

Generate a macOS local run directory and ZIP, with Node bundled, for the completed standalone service. Aimed at local development acceptance on this machine, with no need to install DSH or npm dependencies. Keep the standalone product version at 0.1.0, and do not change the plugin version, CI or the release pipeline.
Single-machine use; the service still listens only on the loopback address. Use the existing data directory rules, and do not copy user data into the program package.
Startup performance follows the existing service; add no runtime build or dependency downloads.

## Decision log

- Confirmed: use a portable package, rejecting the lightweight package that requires the user to install Node, and the installer package that adds a desktop shell and a signing flow.
- The first phase builds and validates only the build machine's macOS architecture. The Node executable and its complete license are provided explicitly by the builder.
- Keep the relative paths of the existing sources, Workers, static pages and WASM, copying via an explicit file list.
  The workspace is not packaged recursively, so accounts, configuration, logs, node_modules and Git files do not enter the package.
- Node must satisfy the product's engines and may link only macOS system libraries. Do not pass the current machine's third-party dynamic-library dependencies on to the user.
- Output goes only into dist; an existing artifact with the same name is an error. The artifact manifest records the actual file digests and the Node version; it does not represent a release signature.
- The start entry point locates Node and the code relative to its own position, can be started from another working directory, and passes through the existing command-line arguments.
- Validate the actual extracted ZIP artifact, including digests, execute permissions, starting with no system Node, the admin page, assets, authentication,
  local stand-in inference, exit, and key retention after a restart.

## Build and acceptance

```sh
npm run pack:standalone -- --node-license /path/to/the/matching/Node-LICENSE
npm run test:package -- --package dist/ofm-standalone-...
```

The build script does not access the network; the Node LICENSE must correspond to the supplied runtime version and include the third-party notices.
This phase creates no tag, GitHub Release or npm package, uploads no artifact, and does not adjust the product version for packaging.
An official release and the installation experience on other operating systems need separate authorization and acceptance.
