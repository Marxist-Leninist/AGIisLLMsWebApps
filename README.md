# WebAppAGIIsLLMs
A ton of webapp cilent side mainly, some may use free apis I guess, some may do server side stuff too. They all crested by ChatGPTo1 Preview, now as of 08/12/2024 ChatGPT o1 Pro mode or whatever current smartest AGI llm is currently (now claude 3.7 reasonings). As 08/12/2025 that is Claude Opus 4.5
website:
https://marxist-leninist.github.io/AGIisLLMsWebApps/

## Catalogue and checks

The home page loads `apps.json` from this site, rather than requesting every
page and its history from GitHub for each visitor. After adding or renaming an
HTML page, regenerate and commit the catalogue:

```sh
python3 scripts/build-app-manifest.py
python3 scripts/check-html-scripts.py
node --test tests/catalogue.test.cjs
```

Python 3 and Node.js are required for these checks. Serve this directory with
`python3 -m http.server 8000` for local testing. The syntax check covers inline
JavaScript in all HTML pages, not external libraries, shader compilation,
embedded worker strings, scientific correctness, or every interactive flow.
See `AUDIT.md` for current coverage and remaining work.
