# Security Policy

## Supported Versions

| Version | Supported          | Notes              |
| ------- | ------------------ | ------------------ |
| 0.x     | :white_check_mark: | Active development |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them to the project maintainers via one of the following channels:

1. **Email** — Send a description of the vulnerability to the maintainers directly.
2. **Private security advisory** — If available, use GitHub's private vulnerability reporting feature.

Please include as much of the following as possible:

- Type of vulnerability (e.g., XSS, injection, DoS)
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact assessment — how an attacker could exploit this vulnerability

A member of the security team will acknowledge your report within 48 hours and provide an estimated timeline for a fix. Once the vulnerability has been resolved, we will disclose the fix and credit the reporter (unless you prefer to stay anonymous).

## Threat Model

nomad.md is a local-first, client-side application. Understanding the trust boundaries is essential for assessing risk.

### Trust Boundaries

| Zone            | Description                                                    | Trust Level                 |
| --------------- | -------------------------------------------------------------- | --------------------------- |
| Filesystem      | Local `.nomad.md/` directory via File System Access API        | **High** — user-controlled  |
| IndexedDB       | Local browser storage for handles and adapter state            | **High** — browser-isolated |
| Git Remote      | Optional remote Git repository (GitHub, Gitea, etc.)           | **Medium** — network call   |
| Markdown Input  | Issue body, template content rendered via `marked` + DOMPurify | **Medium** — sanitized      |
| Third-party CDN | External resources loaded via `<script>` / `<link>`            | **Low** — see § CSP         |

### Known & Mitigated Risks

| Risk                                  | Status                             | Mitigation                                                                    |
| ------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| XSS via unsanitized Markdown          | :white_check_mark: Mitigated       | All rendered HTML passes through `dompurify` with strict config               |
| YAML deserialization DoS (js-yaml)    | :white_check_mark: Mitigated       | Pinned at `js-yaml@^4.2.0` with safe `JSON_SCHEMA`; input size limit enforced |
| Malicious cookie via `cookie` library | :white_check_mark: Mitigated       | Pinned at `cookie@^0.7.0` via pnpm overrides                                  |
| Remote Git supply chain               | :white_check_mark: Acceptable Risk | Repository URL is user-provided; no automatic fetch                           |
| CSP missing (deferred)                | :warning: Deferred to Step 6       | SvelteKit CSP headers planned for production build                            |
| SRI on modulepreloads (deferred)      | :warning: Deferred to Step 6       | Planned alongside CSP                                                         |
| `remote-git.ts` low coverage (30%)    | :warning: Deferred to Step 8       | Isomorphic-git mock coverage needs expansion                                  |

### Content Security Policy (Planned)

A strict CSP will be configured in the SvelteKit production build (Step 6). Expected policy:

```
default-src 'self';
script-src 'self' 'strict-dynamic';
style-src 'self' 'unsafe-inline';         # Tailwind + prose
img-src 'self' data: blob:;
connect-src 'self' <git-remote-origin>;   # Only configured remote
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

### Dependency Management

- **pnpm overrides** enforce minimum versions across the entire dependency tree:
  - `js-yaml: ^4.2.0` — prevents DoS via crafted YAML
  - `cookie: ^0.7.0` — prevents HTTP response splitting
- Run `pnpm audit` to check for new vulnerabilities before each release

### Security Scans

| Tool                             | Status                   | Notes                                                          |
| -------------------------------- | ------------------------ | -------------------------------------------------------------- |
| `pnpm audit`                     | :white_check_mark: Clean | 0 active advisories                                            |
| Dependency reachability analysis | :white_check_mark: Pass  | `serializer.ts` is the only js-yaml consumer; covered by tests |
| DOMPurify config audit           | :white_check_mark: Pass  | `ALLOWED_TAGS: []` denies all HTML by default                  |
