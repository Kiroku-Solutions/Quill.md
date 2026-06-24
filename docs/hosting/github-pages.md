# Hosting on GitHub Pages

GitHub Pages is a free, opinionated static host. It is the most common
hobby-tier target for a SvelteKit SPA, but it has two properties that
shape how `nomad.md` ships there:

1. **GitHub Pages does not honour `_headers`.** The file is copied
   verbatim into the published site, but GitHub's serving tier strips
   the custom response headers. The `static/_headers` file shipped
   with `nomad.md` is therefore inert on GitHub Pages; only the
   `<meta http-equiv>` fallbacks in `src/app.html` apply.
2. **GitHub Pages does not honour `_redirects` either.** The
   `static/_redirects` file is harmless to ship (it is a static
   file with no special meaning to GitHub Pages) but does not
   configure a SPA fallback. GitHub Pages' SPA fallback convention
   is to publish a `404.html` that the Pages serving tier
   substitutes for missing paths. `adapter-static` already emits
   `build/404.html` (an exact copy of `build/index.html`) so the
   convention is satisfied automatically.

This page documents the residual security gap when shipping on
GitHub Pages, and what an admin can do to close it.

## The CSP gap

The full CSP shipped in `static/_headers` cannot be applied on
GitHub Pages. `<meta http-equiv="Content-Security-Policy">` honours
**most** directives, but the spec explicitly excludes the following
from the `<meta>` form:

| Directive                   | Honoured via `<meta>`? | Notes                                                    |
| --------------------------- | :--------------------: | -------------------------------------------------------- |
| `default-src`               |          Yes           |                                                          |
| `script-src`                |      Yes (mostly)      | `'strict-dynamic'` and per-build nonces are not portable |
| `style-src`                 |          Yes           |                                                          |
| `img-src`                   |          Yes           |                                                          |
| `font-src`                  |          Yes           |                                                          |
| `connect-src`               |          Yes           |                                                          |
| `object-src`                |          Yes           |                                                          |
| `base-uri`                  |          Yes           |                                                          |
| `frame-ancestors`           |         **No**         | `<meta>` fallback in `src/app.html` covers this          |
| `form-action`               |         **No**         | Page-level only; no fallback                             |
| `report-uri`                |         **No**         |                                                          |
| `sandbox`                   |         **No**         |                                                          |
| `require-trusted-types-for` |          Yes           | `trusted-types` policy names are honoured                |
| `upgrade-insecure-requests` |          Yes           |                                                          |

Source: W3C CSP3 §6.1 (https://www.w3.org/TR/CSP3/#meta-element).

In practice the practical gap is **small** for `nomad.md`:

- The app is a client-side SPA. There are no `<form>` submissions
  (`form-action 'none'` is enforced by the absence of any form
  action; the `<meta>` form of the directive is unreachable, so the
  loss is moot).
- `frame-ancestors` is already covered by the `<meta http-equiv>`
  fallback in `src/app.html` (the only directive we ship there;
  see `src/app.html:13`).
- HSTS **cannot** be set via `<meta>`. Users should rely on
  the browser's HSTS preload list
  (https://hstspreload.org/) for the host. A user who navigates
  to `https://<user>.github.io/<repo>/` over HTTP will not be
  upgraded by HSTS unless the host has been submitted to the
  preload list; GitHub Pages does not submit subdomains
  automatically.

The net effect: GitHub Pages users get a slightly weaker CSP
than Netlify / Cloudflare Pages users. The remaining directives
that ARE honoured via `<meta>` (everything except `frame-ancestors`,
`form-action`, `report-uri`, `sandbox`) still apply. The
`_headers` file is still shipped in `build/`; on Netlify /
Cloudflare Pages it is the canonical source, on GitHub Pages it
is a no-op (which is fine — the `<meta>` fallbacks cover the
critical directives).

## The HSTS gap

HSTS is the largest practical loss on GitHub Pages. Without
HSTS, a man-in-the-middle on the first visit to the site can
downgrade the connection. The mitigations:

- The site already ships `Strict-Transport-Security:
max-age=63072000; includeSubDomains; preload` via
  `static/_headers` for hosts that honour it (Netlify,
  Cloudflare Pages).
- Users can add the site to Chrome's built-in HSTS list
  manually (not a deployer-controlled knob).
- For a true HSTS deployment on GitHub Pages, the only
  workaround is to front the Pages site with a CDN that
  injects HSTS — e.g. Cloudflare in front of a `*.github.io`
  custom domain.

## The SRI gap

`scripts/add-sri.mjs` runs after `vite build` and stamps
`integrity=` + `crossorigin="anonymous"` on every
`<link rel="modulepreload">` and `<script type="module" src="…">`
in `build/index.html`. The `integrity` attribute is honoured by
all modern browsers regardless of the host. **SRI works on
GitHub Pages**; only the host-controlled headers are stripped.

## The SPA fallback gap

`adapter-static` emits `build/404.html` (an exact copy of
`build/index.html`) for use as a SPA fallback on hosts that
support it. GitHub Pages does serve `404.html` as a custom 404
page, and the Pages serving tier substitutes it for any path
that does not resolve to a file. The convention is documented at
<https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site>.

In effect: refreshing `https://<user>.github.io/<repo>/remote/123`
on GitHub Pages will serve `404.html` (which is `index.html`),
the client router takes over, and the URL stays stable. **This
is the GitHub-Pages-native SPA fallback; no `_redirects` config
is required.**

## The defence-in-depth `<meta>` fallbacks in `src/app.html`

`src/app.html` ships two `<meta http-equiv>` fallbacks that
work on **every** host (including GitHub Pages):

- `<meta http-equiv="Content-Security-Policy" content="frame-ancestors 'none';" />`
  (line 13) — clickjacking defence; the only directive the
  spec excludes from `<meta>` that we ship.
- `<meta name="referrer" content="no-referrer" />`
  (line 19) — Referrer-Policy fallback. Browsers honour
  `<meta name="referrer">` even on hosts that strip the
  `Referrer-Policy` response header.

These two fallbacks are the floor. The host-controlled
headers in `static/_headers` are the ceiling.

## The trade-off

| Host             | CSP coverage           | HSTS                      | SRI | SPA fallback                |
| ---------------- | ---------------------- | ------------------------- | --- | --------------------------- |
| Netlify          | Full                   | Yes                       | Yes | `_redirects`                |
| Cloudflare Pages | Full                   | Yes                       | Yes | `_redirects` (auto-emitted) |
| GitHub Pages     | Partial (via `<meta>`) | No (browser preload only) | Yes | `404.html`                  |

GitHub Pages users get a working app with a slightly weaker
CSP than the other hosts. The practical risk surface is the
HSTS gap (no MITM protection on first visit) and the missing
`form-action` (no form submissions exist anyway).

## What an admin can do

1. **Move to Netlify or Cloudflare Pages** for full CSP + HSTS
   coverage. The deploy is a single config file; the `_headers`
   file already in the repo works out of the box.
2. **Add a custom domain** with Cloudflare in front of GitHub
   Pages. The Cloudflare proxy can set HSTS at the edge.
3. **Accept the residual risk** if GitHub Pages is the only
   option. The app's threat model (local-first, no auth, no
   persistent cookies, no third-party fetches) keeps the
   surface small.

## Follow-ups

- A GitHub Action that injects CSP via a custom service worker
  (defence-in-depth on top of the `<meta>` fallbacks) was
  considered and deferred. The remaining risk is documented
  here.
- A deployer-controlled knob to enable a strict CSP via a
  service worker is a Step 7 candidate.
