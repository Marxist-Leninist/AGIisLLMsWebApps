const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const apps = JSON.parse(fs.readFileSync(path.join(root, 'apps.json')));
const script = fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function element() {
  return {children: [], style: {}, value: 'random', textContent: '', listeners: {},
    set innerHTML(_) {this.children = []}, appendChild(c) {this.children.push(c)},
    addEventListener(event, callback) {this.listeners[event] = callback}};
}
async function boot({badFetch=false, badStorage=false, cache=null}={}) {
  const elements = Object.fromEntries(['current-year','app-list','search-input','sort-by'].map(id=>[id,element()]));
  elements['search-input'].value='';
  const calls=[];
  const context=vm.createContext({document:{getElementById:id=>elements[id],createElement:element},
    fetch:async url=>{calls.push(url);if(badFetch)throw Error('offline');return {ok:true,json:async()=>apps}},
    localStorage:{setItem(){if(badStorage)throw Error('denied')},getItem(){if(badStorage)throw Error('denied');return cache}},
    AbortSignal, console, Date, Math, encodeURIComponent});
  vm.runInContext(script,context); await new Promise(resolve=>setImmediate(resolve));
  return {elements,calls,context};
}
test('manifest lists every non-index HTML file with existing safe paths',()=>{
  const html = fs.readdirSync(root, {recursive:true}).filter(x=>x.endsWith(".html") && x!=="index.html" && !x.split(path.sep).some(p=>p.startsWith(".")));
  assert.equal(apps.length,html.length);assert.equal(new Set(apps.map(x=>x.filename)).size,apps.length);
  for(const app of apps) assert.ok(fs.statSync(path.join(root,app.filename)).isFile());
});
test('one request populates catalogue even when storage is denied',async()=>{
 const {elements,calls}=await boot({badStorage:true});
 assert.deepEqual(calls,['apps.json']);assert.equal(elements['app-list'].children.length,apps.length);
 const link=elements['app-list'].children.find(x=>x.children[0].href.includes('%20'));
 assert.ok(link);assert.ok(!link.children[0].href.includes(' '));
});
test('filename search survives sort changes and empty results',async()=>{
 const {elements}=await boot(); const input=elements['search-input'];
 input.value='solar_system_delay_vs_newton'; input.listeners.input();
 assert.equal(elements['app-list'].children.length,1);
 elements['sort-by'].value='alphabetical';elements['sort-by'].listeners.change();
 assert.equal(elements['app-list'].children.length,1);
 input.value='nothing-matches-xyz';input.listeners.input();
 assert.equal(elements['app-list'].children[0].textContent,'No results found.');
});
test('offline cached catalogue works; corrupt or unsafe cache fails gracefully',async()=>{
 assert.equal((await boot({badFetch:true,cache:JSON.stringify(apps)})).elements['app-list'].children.length,apps.length);
 for(const cache of ['{broken',JSON.stringify([{filename:'javascript:alert(1).html',displayName:'bad'}])]){
  const {elements}=await boot({badFetch:true,cache});
  assert.match(elements['app-list'].children[0].textContent,/unavailable/);
 }
});
