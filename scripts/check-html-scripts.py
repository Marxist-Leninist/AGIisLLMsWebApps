from html.parser import HTMLParser
from pathlib import Path
import subprocess,json,tempfile,sys,os
os.chdir(Path(__file__).resolve().parents[1])
class P(HTMLParser):
 def __init__(self):super().__init__();self.scripts=[];self.current=None
 def handle_starttag(self,t,a):
  if t=='script':self.current=[dict(a),'']
 def handle_data(self,d):
  if self.current:self.current[1]+=d
 def handle_endtag(self,t):
  if t=='script' and self.current:self.scripts.append(self.current);self.current=None
errors=[];count=0
for p in sorted(Path('.').rglob('*.html')):
 x=P();x.feed(p.read_text(errors='replace'))
 for i,(attrs,code) in enumerate(x.scripts):
  if 'src' in attrs or attrs.get('type','') not in ('','text/javascript','application/javascript','module'):continue
  count+=1
  with tempfile.NamedTemporaryFile(suffix='.mjs' if attrs.get('type')=='module' else '.js',mode='w') as f:
   f.write(code);f.flush();r=subprocess.run(['node','--check',f.name],capture_output=True,text=True)
  if r.returncode:errors.append({'file':str(p),'script':i,'error':r.stderr})
print('Scripts',count,'errors',len(errors));print('\n'.join(e['file']+' '+e['error'].split('SyntaxError:')[-1].split('\n')[0] for e in errors))

sys.exit(bool(errors))
