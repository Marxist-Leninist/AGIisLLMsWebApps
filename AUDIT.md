# App audit: first repair batch

## Inventory

511 HTML documents: the main catalogue plus 510 app/article pages, including
nested pages. `apps.json` records their paths, titles, and last committed dates.
No existing package manifest or test suite was present.

## Reproduced and repaired

- `Auto1.html`: escaped template delimiters made the entire animation script fail to parse.
- `altffmpeg4.html`: escaped template delimiters made the audio extraction script fail to parse.
- `minecraft-learned-physics (7).html` and `(8).html`: duplicate `const seed` declarations prevented either game from starting.
- `solar_system_delay_vs_newton.html`: truncated control-array expression prevented script parsing.
- `w7.html`: missing template/shader string delimiters and a minified single-line comment swallowed the rest of the program. Restored delimiters and GLSL version-line boundaries.
- Main catalogue: per-app title/commit requests produced roughly a thousand external requests, and a rejected HEAD request could discard the entire list. Replaced this with one same-origin generated manifest. Storage failure is nonfatal; malformed cached data is rejected; filename search and URL-encoded links are supported.

## Verification and limits

- Before: six inline JavaScript parse failures across 485 scripts.
- Tests cover catalogue file existence, one-request loading, denied storage,
  filename search, sorting after filtering, no matches, offline cache, corrupt
  cache and unsafe cached URLs.
- Headless Chromium smoke testing was attempted but could not launch in this
  executor (`socket() failed: Operation not permitted`), including an approved
  sandbox escalation. Do not treat this as browser/GPU functional validation.
- No external API-backed workflow, file conversion, shader compilation, gameplay,
  mobile sensor permission, or scientific result has been certified by this batch.
- No deployment or merge is part of this repair batch. Remaining work is staged
  browser testing by app family and external dependency inspection.
