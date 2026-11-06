# #49 Settings Page Admission Compatibility Fix

## Scope and assumptions

- The settings API and model calls are separate entry points; this fix addresses the fallback admission check of the settings API.
- Service objects are looked up per request, and the host `connection.admit` decision continues to take priority.
- Reproduced: the desktop proxy removes Origin and Sec-Fetch-Site and keeps the `dsh-app://app/` Referer; the original fallback check rejected that request.
- Only the exact authority of this desktop origin is accepted, and only when there is no Origin or Sec-Fetch-Site and the Host is still a loopback address.
- Normal requests add no logging; rejection logs contain only a fixed entry point, status, origin and reason, and no request headers, URL, Cookie, Token or exception body.
- This change does not adjust models, user configuration, release signing or the upgrade flow; if the host authentication service throws, admission stops.

Assumption: the desktop proxy's behaviour is based on the actually installed code of the local DSH Desktop 0.2.0-rc.2. #49 provided no version or failing request, so the issue's real cause cannot be considered confirmed.

## Decision record

| Option | Decision and reason |
| --- | --- |
| Accommodate only the desktop proxy format | Adopted; keeps the ordinary HTTP same-origin check, and restricts the allowed desktop authority and header shape. |
| Remove all Referer checks | Not adopted; it would widen the pass range of the existing fallback check. |
| Only add diagnostics | Not adopted on its own; it can identify the source of a rejection but cannot fix the reproduced false rejection. |

When the host explicitly returns 401/403, the fallback check is not used. When the host admission call or service read throws, return 503 rather than degrading to a fallback check that lacks host identity verification. The diagnostics cover both the JSON API and SSE entry points.

## Verification requirements

Cover the desktop fallback check, malicious or credential-bearing desktop Referers, Origin/Fetch-Metadata that was not stripped, cross-site and non-loopback Hosts, host 401/403, host exceptions, late-arriving services, and the actually registered JSON/SSE routes. Run the contributor offline tests and `git diff --check`.

These regression verifications are not equivalent to reproducing the #49 user environment; the path still needs to be confirmed on site using the rejection logs. The release digest and signature are prepared by the maintainer following the release process.
