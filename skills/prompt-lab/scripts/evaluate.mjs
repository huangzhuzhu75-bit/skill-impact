#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function grade(text, checks) {
  const failures = [];
  for (const term of checks.contains ?? []) if (!text.includes(term)) failures.push(`Missing required text: ${term}`);
  for (const term of checks.excludes ?? []) if (text.includes(term)) failures.push(`Contains excluded text: ${term}`);
  if (checks.maxChars && [...text.trim()].length > checks.maxChars) failures.push(`Exceeds ${checks.maxChars} characters`);
  if (checks.jsonKeys) {
    try {
      const value = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Not an object');
      for (const key of checks.jsonKeys) if (!Object.hasOwn(value,key)) failures.push(`Missing JSON key: ${key}`);
    } catch { failures.push('Response is not a plain JSON object'); }
  }
  return {passed:failures.length===0,failures};
}

function validate(config) {
  if (!['scripted-demo','real-saved-outputs'].includes(config.dataKind)) throw new Error('dataKind must be scripted-demo or real-saved-outputs');
  if (typeof config.provenance !== 'string' || !config.provenance.trim()) throw new Error('provenance is required');
  if (!Array.isArray(config.cases) || !config.cases.length) throw new Error('At least one case is required');
  const ids = new Set();
  for (const c of config.cases) {
    if (typeof c.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(c.id) || ids.has(c.id)) throw new Error(`Invalid or duplicate case id: ${c.id}`);
    ids.add(c.id);
    if (typeof c.input !== 'string' || !c.input.trim()) throw new Error(`Missing input: ${c.id}`);
    const checks = c.checks;
    if (!checks || typeof checks !== 'object' || Array.isArray(checks)) throw new Error(`Missing checks: ${c.id}`);
    const keys = Object.keys(checks);
    if (!keys.length || keys.some(k=>!['contains','excludes','jsonKeys','maxChars'].includes(k))) throw new Error(`Unknown or empty checks: ${c.id}`);
    for (const key of keys) {
      if (key==='maxChars') {
        if (!Number.isInteger(checks[key]) || checks[key]<1) throw new Error(`Invalid maxChars: ${c.id}`);
      } else if (!Array.isArray(checks[key]) || !checks[key].length || checks[key].some(s=>typeof s!=='string'||!s)) throw new Error(`Invalid ${key}: ${c.id}`);
    }
  }
}

export function initialize(dir) {
  if (existsSync(dir)) throw new Error(`Destination exists: ${dir}`);
  for (const v of ['a','b']) mkdirSync(join(dir,'responses',v),{recursive:true});
  mkdirSync(join(dir,'prompts'));
  writeFileSync(join(dir,'prompts/a.md'),'Answer the request.\n');
  writeFileSync(join(dir,'prompts/b.md'),'Return only the requested data. Match JSON keys and length constraints exactly.\n');
  const config = {dataKind:'scripted-demo',provenance:'Handwritten demonstration responses; no model calls. Replace all material before real evaluation.',cases:[
    {id:'json',input:'Return a JSON object with title and tags.',checks:{jsonKeys:['title','tags']}},
    {id:'brief',input:'Say hello using at most 12 characters.',checks:{contains:['Hello'],maxChars:12}},
    {id:'no-fence',input:'Reply with ready and no code fences.',checks:{contains:['ready'],excludes:['```']}}
  ]};
  writeFileSync(join(dir,'cases.json'),JSON.stringify(config,null,2));
  const outputs = {a:['Here is the JSON: {"title":"Demo","tags":[]}', 'Hello, happy to help you today!', 'ready'], b:['{"title":"Demo","tags":[]}', 'Hello!', 'ready']};
  for (const v of ['a','b']) config.cases.forEach((c,i)=>writeFileSync(join(dir,'responses',v,c.id+'.txt'),outputs[v][i]));
}

export function evaluate(dir) {
  const config = JSON.parse(readFileSync(join(dir,'cases.json'),'utf8'));
  validate(config);
  const prompts = {};
  for (const v of ['a','b']) {
    const value = readFileSync(join(dir,'prompts',v+'.md'),'utf8');
    if (!value.trim()) throw new Error(`Prompt ${v} is empty`);
    prompts[v] = {sha256:createHash('sha256').update(value).digest('hex'),utf8Bytes:Buffer.byteLength(value)};
  }
  const rows = config.cases.map(c=>{
    const row = {id:c.id};
    for (const v of ['a','b']) {
      const file = join(dir,'responses',v,c.id+'.txt');
      if (!existsSync(file)) row[v] = {passed:null,failures:['Missing output']};
      else {
        const text = readFileSync(file,'utf8');
        row[v] = {...grade(text,c.checks),sha256:createHash('sha256').update(text).digest('hex')};
      }
    }
    return row;
  });
  const pairs = rows.filter(r=>r.a.passed!==null && r.b.passed!==null);
  const wins = pairs.filter(r=>!r.a.passed && r.b.passed).length;
  const losses = pairs.filter(r=>r.a.passed && !r.b.passed).length;
  const result = {dataKind:config.dataKind,provenance:config.provenance,generatedAt:new Date().toISOString(),prompts,casesSha256:createHash('sha256').update(readFileSync(join(dir,'cases.json'))).digest('hex'),costUsd:null,pairedCases:pairs.length,wins,losses,differencePp:pairs.length?100*(wins-losses)/pairs.length:null,rows};
  writeFileSync(join(dir,'results.json'),JSON.stringify(result,null,2));
  const summary = ['a','b'].map(v=>{
    const valid=rows.filter(r=>r[v].passed!==null), passed=valid.filter(r=>r[v].passed).length;
    return `<article><label>PROMPT ${v.toUpperCase()}</label><strong>${passed}/${valid.length}</strong><p>checks passed · ${rows.length-valid.length} missing outputs</p><p>${prompts[v].utf8Bytes} prompt bytes · cost unknown</p></article>`;
  }).join('');
  const table = rows.map(r=>`<tr><th>${esc(r.id)}</th>${['a','b'].map(v=>`<td class="${r[v].passed===null?'error':r[v].passed?'pass':'fail'}">${r[v].passed===null?'MISSING':r[v].passed?'PASS':'FAIL'}<small>${r[v].failures.map(esc).join('<br>')}</small></td>`).join('')}</tr>`).join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Prompt Lab · Comparison</title><style>body{margin:0;background:#10151c;color:#edf3fa;font:16px/1.6 system-ui}main{max-width:1000px;margin:auto;padding:40px 24px}header,label{color:#79e2bf;letter-spacing:2px}h1{font-size:clamp(32px,5vw,52px);line-height:1.15;letter-spacing:-1.5px}p,small{color:#a9b7c9}.notice{border-left:3px solid #ffd18b;background:#27251f;padding:18px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;margin:24px 0}article,section{background:#19212c;border:1px solid #303d4d;border-radius:14px;padding:24px}strong{display:block;font-size:56px}table{width:100%;border-collapse:collapse;text-align:left}td,th{padding:18px 12px;border-bottom:1px solid #303d4d}small{display:block;font-size:12px}.pass{color:#79e2bf}.fail{color:#ffaaa9}.error{color:#ffd18b}details{margin-top:24px;overflow-wrap:anywhere}summary{cursor:pointer}footer{margin-top:28px;color:#a9b7c9;font-size:13px}</style><main><header>PROMPT LAB / LOCAL EVIDENCE</header><h1>Better prompts.<br>Show the difference.</h1><div class="notice">${config.dataKind==='scripted-demo'?'<b>SCRIPTED DEMO — handwritten outputs, no model calls.</b>':'Saved-output constraint checks — provenance supplied by the operator.'} This report checks declared constraints, not factual accuracy or general quality.</div><div class="cards">${summary}</div><section><h2>Observed changes</h2><p>${pairs.length} paired cases · ${wins} improved · ${losses} regressed · ${pairs.length-wins-losses} unchanged</p><p>${result.differencePp===null?'No paired evidence':`Observed pass-rate difference: ${result.differencePp.toFixed(1)} percentage points.`} This is descriptive, not a claim of statistical significance or equivalence.</p><table><tr><th>Case</th><th>Prompt A</th><th>Prompt B</th></tr>${table}</table></section><details><summary>Provenance and reproducibility</summary><p>${esc(config.provenance)}</p><p>Generated: ${esc(result.generatedAt)}</p><p>Prompt A SHA-256: ${prompts.a.sha256}<br>Prompt B SHA-256: ${prompts.b.sha256}</p><p>Exact response hashes and check failures are retained in results.json. Prompt and response bodies are omitted from this report. Monetary cost: unknown. No API or network requests were made by this helper.</p></details><footer>Use held-out examples and independent runs before adopting an optimized prompt.</footer></main></html>`;
  writeFileSync(join(dir,'report.html'),html);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [cmd,...args]=process.argv.slice(2);
    const flag=k=>args[args.indexOf(k)+1];
    if (cmd==='init' && args.includes('--out')) {const dir=resolve(flag('--out')); initialize(dir); evaluate(dir); console.log(`SCRIPTED DEMO created: ${join(dir,'report.html')}`);}
    else if (cmd==='evaluate' && args.includes('--dir')) {const dir=resolve(flag('--dir')); const r=evaluate(dir); console.log(`${r.pairedCases} pairs: ${r.wins} improved, ${r.losses} regressed.\nReport: ${join(dir,'report.html')}`); process.exitCode=r.rows.some(r=>r.a.passed===null||r.b.passed===null)?2:0;}
    else throw new Error('Usage: evaluate.mjs init --out NEW_DIR | evaluate --dir DIR');
  } catch (e) {console.error(e.message);process.exitCode=2;}
}
