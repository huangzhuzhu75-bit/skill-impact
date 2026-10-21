#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>typeof v==='number' && Number.isFinite(v) && v>=0?v:null;
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const percentile=(xs,p)=>xs[Math.min(xs.length-1,Math.floor(p*xs.length))];
const fmt=(v,dp=1)=>v===null?'Unknown':v.toFixed(dp);
const csv=v=>'"'+String(v??'').replaceAll('"','""')+'"';

function child(root,...parts) {
  const p=resolve(root,...parts), rel=relative(resolve(root),p);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Unsafe source path');
  return p;
}

export function normalize(data,options={}) {
  const rows=[], warnings=[], evidence=[];
  let qualityLabel, source;
  const baseline=options.baseline??(Array.isArray(data.trials)?'none':'without_skill');
  const candidate=options.candidate??(Array.isArray(data.trials)?'always-on':'with_skill');
  if (baseline===candidate) throw new Error('Baseline and candidate must differ');
  if (Array.isArray(data.trials)) {
    source='ctx-eval'; qualityLabel='Task success rate';
    for(const t of data.trials) rows.push({task:String(t.taskId),repeat:t.repeat,configuration:t.arm,quality:typeof t.passed==='boolean'?Number(t.passed):null,durationSeconds:number(t.durationMs)===null?null:t.durationMs/1000,tokens:number(t.tokensIn)!==null&&number(t.tokensOut)!==null?t.tokensIn+t.tokensOut:null,costUsd:number(t.costUsd),toolCalls:null,ttftSeconds:null});
    if (!data.complete) warnings.push('Source experiment is incomplete.');
    warnings.push('Selected-file worktrees do not prove isolation from Git history, ancestor rules or global instructions.');
  } else if(Array.isArray(data.runs)) {
    source='anthropic-compatible-benchmark'; qualityLabel='Mean assertion pass rate';
    for(const run of data.runs) {
      const r=run.result??{};
      let tokens=null, duration=number(r.time_seconds), ttft=null;
      if(duration===0) duration=null; // upstream may substitute zero for missing timing
      if(data.metadata?.tokens_provenance==='provider-reported') tokens=number(r.tokens);
      if(options.workspace) {
        const timingPath=child(options.workspace,`eval-${run.eval_id}`,run.configuration,`run-${run.run_number}`,'timing.json');
        if(existsSync(timingPath)) {
          const bytes=readFileSync(timingPath), timing=JSON.parse(bytes.toString('utf8'));
          tokens=number(timing.total_tokens);
          duration=number(timing.total_duration_seconds);
          evidence.push({role:'timing',path:relative(options.workspace,timingPath).replaceAll('\\','/'),sha256:hash(bytes)});
        }
      }
      if(number(r.ttft_ms)!==null) ttft=r.ttft_ms/1000;
      const q=number(r.pass_rate);
      if(q!==null && q>1) throw new Error('pass_rate must be within [0,1]');
      rows.push({task:String(run.eval_id),repeat:run.run_number,configuration:run.configuration,quality:q,durationSeconds:duration,tokens,costUsd:number(r.cost_usd),toolCalls:number(r.tool_calls),ttftSeconds:ttft});
    }
    if(!options.workspace && data.metadata?.tokens_provenance!=='provider-reported') warnings.push('Token totals withheld: upstream aggregate fields may fall back to output character counts. Supply raw timing.json files or documented provider-reported provenance.');
  } else throw new Error('Unsupported input: expected ctx-eval trials[] or benchmark runs[]. Summary-only input is not enough for paired comparisons.');
  const selected=rows.filter(r=>r.configuration===baseline||r.configuration===candidate);
  if(!selected.some(r=>r.configuration===baseline)||!selected.some(r=>r.configuration===candidate)) throw new Error(`Selected configurations not found: ${baseline} / ${candidate}. Available: ${[...new Set(rows.map(r=>r.configuration))].join(', ')}`);
  const keys=new Set();
  for(const r of selected) {
    if(!r.task || r.task==='undefined' || !Number.isInteger(r.repeat) || r.repeat<1) throw new Error('Every run needs a task id and positive integer repeat');
    const key=JSON.stringify([r.configuration,r.task,r.repeat]);
    if(keys.has(key)) throw new Error(`Duplicate task/repeat: ${key}`);
    keys.add(key);
  }
  const metadata=data.metadata??{adapter:data.adapter,requestedModel:data.model,baseCommit:data.baseCommit};
  if(/<model-name>|<skill-name>|<path\//.test(JSON.stringify(metadata))) warnings.push('Source metadata contains template placeholders; reproducibility information is unfinished.');
  if(!metadata.executor_model&&!metadata.requestedModel) warnings.push('No executor model identity is recorded in the imported metadata.');
  warnings.push('Imported observations do not prove identical model, permissions, cache, retry policy or independent sessions. Verify the experiment manifest.');
  warnings.push('No causal claim is established by importing a report. Inspect task sampling, grading method and skill activation evidence.');
  return {source,baseline,candidate,qualityLabel,rows:selected,warnings,evidence,metadata};
}

export function summarize(dataset) {
  const {rows,baseline,candidate}=dataset;
  const left=new Map(rows.filter(r=>r.configuration===baseline).map(r=>[JSON.stringify([r.task,r.repeat]),r]));
  const right=new Map(rows.filter(r=>r.configuration===candidate).map(r=>[JSON.stringify([r.task,r.repeat]),r]));
  const keys=[...new Set([...left.keys(),...right.keys()])];
  const pairs=keys.map(key=>({baseline:left.get(key)??null,candidate:right.get(key)??null}));
  const metrics={};
  for(const name of ['quality','durationSeconds','tokens','costUsd','toolCalls','ttftSeconds']) {
    const valid=pairs.filter(p=>p.baseline?.[name]!==null&&p.baseline?.[name]!==undefined&&p.candidate?.[name]!==null&&p.candidate?.[name]!==undefined);
    const b=mean(valid.map(p=>p.baseline[name])), c=mean(valid.map(p=>p.candidate[name]));
    metrics[name]={baseline:b,candidate:c,pairedObservations:valid.length,missingPairs:keys.length-valid.length,delta:b===null||c===null?null:c-b,improvementPct:b===null||c===null||b===0?null:100*(b-c)/b};
  }
  const qualityPairs=pairs.filter(p=>p.baseline?.quality!==null&&p.baseline?.quality!==undefined&&p.candidate?.quality!==null&&p.candidate?.quality!==undefined);
  const clusters=new Map();
  for(const p of qualityPairs) {const list=clusters.get(p.baseline.task)??[];list.push(p.candidate.quality-p.baseline.quality);clusters.set(p.baseline.task,list);}
  let ci95=null;
  if(clusters.size>=2) {
    const cs=[...clusters.values()], diffs=[];
    let seed=42;
    for(let i=0;i<5000;i++) {
      let sum=0,n=0;
      for(let j=0;j<cs.length;j++) {seed=(Math.imul(seed,1664525)+1013904223)>>>0; const cluster=cs[Math.floor(seed/4294967296*cs.length)];sum+=cluster.reduce((a,b)=>a+b,0);n+=cluster.length;}
      diffs.push(100*sum/n);
    }
    diffs.sort((a,b)=>a-b);ci95=[percentile(diffs,.025),percentile(diffs,.975)];
  }
  const verdict=clusters.size<2?'Insufficient independent tasks':ci95[0]>0?'Observed quality gain':ci95[1]<0?'Observed quality regression':'Quality difference inconclusive';
  return {metrics,pairs,taskClusters:clusters.size,ci95,verdict};
}

export function render(dataset,summary,provenance) {
  const labels={quality:dataset.qualityLabel,durationSeconds:'End-to-end completion time (s)',tokens:'Total tokens',costUsd:'Reported cost (USD)',toolCalls:'Tool calls',ttftSeconds:'Time to first token (s)'};
  const metricRows=Object.entries(summary.metrics).map(([key,m])=>`<tr><th>${esc(labels[key])}</th><td>${fmt(m.baseline,key==='costUsd'?4:2)}</td><td>${fmt(m.candidate,key==='costUsd'?4:2)}</td><td>${key==='quality'?m.delta===null?'Unknown':`${m.delta>=0?'+':''}${(100*m.delta).toFixed(1)} pp`:m.improvementPct===null?'Unknown':`${m.improvementPct>=0?'+':''}${m.improvementPct.toFixed(1)}% reduction`}</td><td>${m.pairedObservations} / ${summary.pairs.length}</td></tr>`).join('');
  const q=summary.metrics.quality;
  const warningList=[...(provenance.dataKind==='synthetic' ? ['SYNTHETIC COMPATIBILITY FIXTURE — no model performance evidence.'] : ['Evidence origin is operator-declared; source hashes identify files, not truth.']),...dataset.warnings];
  const taskRows=summary.pairs.map(p=>`<tr><th>${esc(p.baseline?.task??p.candidate?.task)} / ${p.baseline?.repeat??p.candidate?.repeat}</th><td>${fmt(p.baseline?.quality??null,2)}</td><td>${fmt(p.candidate?.quality??null,2)}</td><td>${fmt(p.baseline?.durationSeconds??null,2)} → ${fmt(p.candidate?.durationSeconds??null,2)} s</td></tr>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="600" viewBox="0 0 1120 600" role="img" aria-labelledby="title description"><title id="title">Skill Impact comparison</title><desc id="description">${esc(provenance.dataKind)}. ${esc(summary.verdict)}. ${esc(dataset.qualityLabel)}. Not proof of causal improvement.</desc><rect width="1120" height="600" fill="#101821"/><g fill="#eef4fa" font-family="sans-serif"><text x="48" y="62" font-size="20" fill="#83e3c5">SKILL IMPACT / EVIDENCE CARD</text><text x="48" y="123" font-size="36">${esc(summary.verdict)}</text><text x="48" y="162" font-size="17" fill="#ffd28d">${esc(provenance.dataKind.toUpperCase())} · ${summary.taskClusters} task clusters · ${q.pairedObservations} quality pairs</text><text x="48" y="220" font-size="22">${esc(dataset.qualityLabel)}</text><text x="48" y="268" font-size="36">${q.baseline===null?'Unknown':(100*q.baseline).toFixed(1)+'%'} → ${q.candidate===null?'Unknown':(100*q.candidate).toFixed(1)+'%'}</text><text x="48" y="320" font-size="21">Completion time: ${fmt(summary.metrics.durationSeconds.baseline)} → ${fmt(summary.metrics.durationSeconds.candidate)} s</text><text x="48" y="365" font-size="21">Total tokens: ${fmt(summary.metrics.tokens.baseline,0)} → ${fmt(summary.metrics.tokens.candidate,0)}</text><text x="48" y="410" font-size="21">Cost (USD): ${fmt(summary.metrics.costUsd.baseline,4)} → ${fmt(summary.metrics.costUsd.candidate,4)}</text><text x="48" y="465" font-size="17" fill="#adbecf">${summary.ci95?'95% quality-difference bootstrap interval: ['+summary.ci95.map(n=>n.toFixed(1)).join(', ')+'] pp':'Quality confidence interval unavailable.'}</text><text x="48" y="512" font-size="16" fill="#adbecf">Completion time is not first-token latency. Unknown metrics stay unknown.</text><text x="48" y="550" font-size="16" fill="#ffd28d">${provenance.dataKind==='synthetic'?'Synthetic fixture: validates integration only.':'Imported measurements: verify model, task and grading controls.'}</text></g></svg>`;
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"><title>Skill Impact · Evidence report</title><style>body{margin:0;background:#101821;color:#eef4fa;font:16px/1.6 system-ui}main{max-width:1150px;margin:auto;padding:36px 24px}header{color:#83e3c5;letter-spacing:2px;font-size:13px}h1{font-size:44px;line-height:1.2;letter-spacing:-1.5px}p,small{color:#adbecf}.banner{border-left:3px solid #ffd28d;background:#29251f;padding:18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;margin:24px 0}article,section,details{background:#19232f;border:1px solid #344250;border-radius:12px;padding:22px;margin-bottom:22px}article strong{display:block;font-size:34px;color:#83e3c5}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;text-align:left;font-size:14px}td,th{padding:14px 10px;border-bottom:1px solid #344250}th{font-weight:500}a{color:#83e3c5}code{overflow-wrap:anywhere}summary{cursor:pointer}li{margin:10px 0}footer{font-size:12px;color:#adbecf}@media print{body{background:white;color:black}article,section,details{background:white;border-color:#ccc}p,small{color:#333}}</style><main><header>SKILL IMPACT / BENCHMARK → EVIDENCE</header><h1>Performance claims,<br>with the evidence attached.</h1><div class="banner">${esc(provenance.dataKind.toUpperCase())} · ${esc(provenance.note)}<br>Report generation makes no model calls. Improvements and regressions are both retained.</div><div class="grid"><article>Quality change<strong>${q.delta===null?'Unknown':(q.delta>=0?'+':'')+(100*q.delta).toFixed(1)+' pp'}</strong>${esc(dataset.qualityLabel)}</article><article>Completion-time reduction<strong>${summary.metrics.durationSeconds.improvementPct===null?'Unknown':summary.metrics.durationSeconds.improvementPct.toFixed(1)+'%'}</strong>Paired end-to-end duration, not first response</article><article>Evidence coverage<strong>${q.pairedObservations}/${summary.pairs.length}</strong>${summary.taskClusters} independent task clusters</article></div><section><h2>${esc(summary.verdict)}</h2><p>${summary.ci95?`95% cluster-bootstrap quality interval: [${summary.ci95.map(n=>n.toFixed(1)).join(', ')}] pp. Resampled by task, 5,000 draws, seed 42.`:'Too few task clusters to estimate an interval.'} This is an observed-task interval; a collapsed interval does not prove generalization.</p><div class="scroll"><table><tr><th>Dimension</th><th>Baseline</th><th>Candidate</th><th>Change</th><th>Paired coverage</th></tr>${metricRows}</table></div><p>Baseline: ${esc(dataset.baseline)} · candidate: ${esc(dataset.candidate)}. Each metric uses its own complete pairs. Missing costs are not zeros. Fewer tool calls do not necessarily mean better quality.</p></section><section><h2>Benchmark integrity notes</h2><ul>${warningList.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></section><details open><summary>Task-level evidence</summary><div class="scroll"><table><tr><th>Task / repeat</th><th>Baseline quality</th><th>Candidate quality</th><th>Completion time</th></tr>${taskRows}</table></div></details><details><summary>Reproducibility manifest</summary><p>Source: ${esc(dataset.source)}<br>Source SHA-256: <code>${provenance.sourceSha256}</code><br>Generated: ${esc(provenance.generatedAt)}</p><p>Model/config metadata: <code>${esc(JSON.stringify(dataset.metadata))}</code></p><p>SHA-256 hashes establish file identity, not authenticity or experimental validity. Raw prompts and outputs are not embedded. Review source metadata before sharing this report.</p></details><section><h2>Export the evidence</h2><p><a href="summary.svg">Presentation figure (SVG)</a> · <a href="metrics.csv">Metric table (CSV)</a> · <a href="evidence.json">Evidence JSON</a> · <a href="table.tex">LaTeX table</a></p></section><footer>Skill Impact · local reporting companion for existing evaluation tools · no analytics or external assets</footer></main></html>`;
  return {html,svg};
}

export function generate(input,out,options={}) {
  if(existsSync(out)) throw new Error(`Output already exists: ${out}. Use a new directory to preserve evidence.`);
  const bytes=readFileSync(input),data=JSON.parse(bytes.toString('utf8'));
  const dataset=normalize(data,options),summary=summarize(dataset);
  const provenance={sourceSha256:hash(bytes),generatedAt:new Date().toISOString(),dataKind:options.dataKind??'unverified-import',note:options.note??'Origin and experiment controls require verification.'};
  const {html,svg}=render(dataset,summary,provenance);
  mkdirSync(out,{recursive:true});
  writeFileSync(join(out,'report.html'),html);
  writeFileSync(join(out,'summary.svg'),svg);
  writeFileSync(join(out,'evidence.json'),JSON.stringify({schemaVersion:1,provenance,dataset,summary},null,2));
  writeFileSync(join(out,'metrics.csv'),['metric,baseline,candidate,delta,paired_observations,missing_pairs',...Object.entries(summary.metrics).map(([key,m])=>[key,m.baseline,m.candidate,m.delta,m.pairedObservations,m.missingPairs].map(csv).join(','))].join('\n')+'\n');
  const latex=s=>s.replace(/[\\{}%&#_$]/g,c=>c==='\\'?'\\textbackslash{}':'\\'+c);
  writeFileSync(join(out,'table.tex'),'\\begin{tabular}{lrrr}\nMetric & Baseline & Candidate & Pairs \\\\\n\\hline\n'+Object.entries(summary.metrics).map(([key,m])=>`${latex(key)} & ${fmt(m.baseline,2)} & ${fmt(m.candidate,2)} & ${m.pairedObservations} \\\\`).join('\n')+'\n\\end{tabular}\n');
  return {dataset,summary,provenance};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2),get=key=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
    if(!get('--input')||!get('--out')) throw new Error('Usage: report.mjs --input benchmark.json --out NEW_DIR [--workspace DIR] [--baseline NAME --candidate NAME] [--data-kind synthetic|unverified-import]');
    const kind=get('--data-kind')??'unverified-import';
    if(!['synthetic','unverified-import'].includes(kind)) throw new Error('Use synthetic or unverified-import; imports are not automatically authenticated.');
    const out=resolve(get('--out'));
    const result=generate(resolve(get('--input')),out,{workspace:get('--workspace')?resolve(get('--workspace')):undefined,baseline:get('--baseline'),candidate:get('--candidate'),dataKind:kind,note:get('--note')});
    console.log(`${result.summary.verdict}\nEvidence report: ${join(out,'report.html')}\nNo model calls performed.`);
  }catch(e){console.error(e.message);process.exitCode=2;}
}
