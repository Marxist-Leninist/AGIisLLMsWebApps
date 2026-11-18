"""Build the same-origin app catalogue. Run after adding/renaming HTML pages."""
from pathlib import Path
from html.parser import HTMLParser
import json, subprocess, re
ROOT = Path(__file__).resolve().parents[1]
class TitleParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.inside = False; self.title = ''
    def handle_starttag(self, tag, attrs):
        if tag == 'title': self.inside = True
    def handle_endtag(self, tag):
        if tag == 'title': self.inside = False
    def handle_data(self, data):
        if self.inside: self.title += data
# One history traversal instead of one API request per app per visitor.
history = subprocess.check_output(['git', '-c', 'core.quotepath=false', 'log', '--format=DATE:%cI', '--name-only', '--', '*.html'], cwd=ROOT, text=True)
dates = {}; date = None
for line in history.splitlines():
    if line.startswith('DATE:'): date = line[5:]
    elif line and date: dates.setdefault(line, date)
apps = []
for path in sorted(ROOT.rglob('*.html')):
    rel = path.relative_to(ROOT).as_posix()
    if rel == 'index.html' or any(part.startswith('.') for part in path.relative_to(ROOT).parts): continue
    parser = TitleParser(); parser.feed(path.read_text(encoding='utf-8', errors='replace'))
    apps.append(dict(filename=rel, displayName=parser.title.strip() or re.sub('[-_]', ' ', path.stem), commitDate=dates.get(rel), originalIndex=len(apps)))
(ROOT / 'apps.json').write_text(json.dumps(apps, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Wrote {len(apps)} apps')
