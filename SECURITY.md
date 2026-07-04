# Security Policy

## Supported Versions

Currently, only the `main` branch is actively supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |
| < 1.0.0 | :x:                |

## Reporting a Vulnerability

Security is a top priority for `quill.md`. We welcome and appreciate reports of security vulnerabilities.

If you discover a vulnerability, **do not** open a public issue. Instead, please email us directly at:
**contact@kirokusolutions.com**

Please include the following information in your report:

- A detailed description of the vulnerability.
- Steps to reproduce the issue.
- Potential impact and any known workarounds.

We will acknowledge receipt of your report within 48 hours and provide updates as we investigate and develop a fix.

## Scope

Please note that `quill.md` relies heavily on local browser APIs (File System Access API, IndexedDB). Vulnerabilities related directly to the browser's implementation of these APIs are outside our threat model, but we welcome reports of how `quill.md` might be misusing them.
