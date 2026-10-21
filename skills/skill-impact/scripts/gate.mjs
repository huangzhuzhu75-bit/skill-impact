#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function evaluatePolicy(evidence,options={}) {
  const required=options.required??['quality','durationSeconds'];
  const thresholds={quality:options.maxQualityDropPp??2,durationSeconds:options.maxDurationIncreasePct??20,tokens:options.maxTokensIncreasePct??20,costUsd:options.maxCostIncreasePct??20};
  for(const [name,value] of Object.entries(thresholds)) if(typeof value!=='number'||!Number.isFinite(value)||value<0) throw new Error(`Invalid threshold: ${name}`);
  const minimum=options.minTasks??2;
  if(!Number.isInteger(minimum)||minimum<2) throw new Error('minTasks must be an integer >=2');
  if(!evidence?.summary?.metrics||!evidence?.provenance||!evidence?.dataset) throw new Error('Expected an evidence.json produced by Skill Impact');
  const {summary,provenance,dataset}=evidence;
  const dataErrors=[],failures=[],warnings=[];
  if(provenance.dataKind==='synthetic') warnings.push('SYNTHETIC DEMONSTRATION: this gate run validates plumbing only, not model performance.');
  if(provenance.dataKind==='synthetic'&&!options.allowSynthetic) dataErrors.push('Synthetic measurements cannot pass a real regression gate.');
  if(summary.taskClusters<minimum) dataErrors.push(`Need at least ${minimum} independent quality task clusters.`);
  if(dataset.warnings?.some(w=>w==='Source experiment is incomplete.')) dataErrors.push('Source experiment is incomplete.');
  for(const name of required) {
    const m=summary.metrics[name];
    if(!m) throw new Error(`Unknown required metric: ${name}`);
    if(m.pairedObservations===0||m.missingPairs>0) dataErrors.push(`Required metric ${name} has incomplete paired coverage.`);
  }
  for(const [name,limit] of Object.entries(thresholds)) {
    const m=summary.metrics[name];
    if(!m||m.delta===null) {warnings.push(`No policy decision for unknown ${name}.`);continue;}
    if(name==='quality') {if(100*m.delta < -limit) failures.push(`Quality fell ${(100*-m.delta).toFixed(2)} pp; allowed drop ${limit} pp.`);}
    else {
      if(m.baseline===0) {if(m.candidate>0) dataErrors.push(`${name} has zero baseline; relative threshold is undefined.`);continue;}
      const increase=100*(m.candidate-m.baseline)/m.baseline;
      if(increase>limit) failures.push(`${name} increased ${increase.toFixed(2)}%; allowed increase ${limit}%.`);
    }
  }
  warnings.push('This is a configured regression policy on paired observations, not proof of statistical significance.');
  return {exitCode:dataErrors.length?2:failures.length?1:0,status:dataErrors.length?'INSUFFICIENT EVIDENCE':failures.length?'REGRESSION':'WITHIN POLICY',dataErrors,failures,warnings,thresholds,requiredMetrics:required,sourceSha256:provenance.sourceSha256};
}

export function renderPrSummary(evidence,policy) {
  const escape=s=>String(s).replace(/[|\r\n]/g,' ').replace(/[<>]/g,c=>c==='<'?'&lt;':'&gt;');
  const lines=['# Skill Impact regression report','',`**${policy.status}** · imported source SHA-256: \`${evidence.provenance.sourceSha256}\``, '', '| Metric | Baseline | Candidate | Paired observations |','|---|---:|---:|---:|'];
  for(const [name,m] of Object.entries(evidence.summary.metrics)) lines.push(`| ${escape(name)} | ${m.baseline===null?'Unknown':m.baseline.toFixed(4)} | ${m.candidate===null?'Unknown':m.candidate.toFixed(4)} | ${m.pairedObservations} |`);
  lines.push('',`Quality unit: ${escape(evidence.dataset.qualityLabel)}. Duration is end-to-end seconds, not first-token latency.`, '', '## Findings', ...[...policy.dataErrors,...policy.failures,...policy.warnings].map(s=>`- ${escape(s)}`),'','No automatic PR comment, upload or model call was performed.');
  return lines.join('\n')+'\n';
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2),get=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];},num=(k,d)=>get(k)===undefined?d:Number(get(k));
    if(!get('--evidence')) throw new Error('Usage: gate.mjs --evidence evidence.json [--markdown pr-summary.md] [--json gate.json] [--require quality,durationSeconds] [--max-quality-drop-pp 2] [--max-duration-increase-pct 20] [--allow-synthetic]');
    const evidence=JSON.parse(readFileSync(resolve(get('--evidence')),'utf8'));
    const policy=evaluatePolicy(evidence,{required:(get('--require')??'quality,durationSeconds').split(','),maxQualityDropPp:num('--max-quality-drop-pp',2),maxDurationIncreasePct:num('--max-duration-increase-pct',20),maxTokensIncreasePct:num('--max-tokens-increase-pct',20),maxCostIncreasePct:num('--max-cost-increase-pct',20),minTasks:num('--min-tasks',2),allowSynthetic:args.includes('--allow-synthetic')});
    if(get('--markdown')) writeFileSync(resolve(get('--markdown')),renderPrSummary(evidence,policy));
    if(get('--json')) writeFileSync(resolve(get('--json')),JSON.stringify(policy,null,2));
    console.log(renderPrSummary(evidence,policy));process.exitCode=policy.exitCode;
  }catch(e){console.error(e.message);process.exitCode=2;}
}
