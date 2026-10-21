import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { normalize, summarize, generate } from '../skills/skill-impact/scripts/report.mjs';

function fixture() {
  return {metadata:{executor_model:'fixture-only'},runs:[
    {eval_id:1,run_number:1,configuration:'without_skill',result:{pass_rate:1,time_seconds:10,tokens:999}},
    {eval_id:1,run_number:1,configuration:'with_skill',result:{pass_rate:0,time_seconds:5,tokens:100}},
    {eval_id:2,run_number:1,configuration:'without_skill',result:{pass_rate:1,time_seconds:10}},
    {eval_id:2,run_number:1,configuration:'with_skill',result:{pass_rate:0,time_seconds:5}}
  ]};
}

test('impact retains quality regressions despite faster completion; ambiguous tokens and dollars stay unknown',()=>{
  const d=normalize(fixture()),s=summarize(d);
  assert.equal(s.verdict,'Observed quality regression');
  assert.equal(s.metrics.durationSeconds.improvementPct,50);
  assert.equal(s.metrics.quality.delta,-1);
  assert.equal(s.metrics.tokens.baseline,null);
  assert.equal(s.metrics.costUsd.candidate,null);
  assert.equal(s.metrics.ttftSeconds.candidate,null);
});
test('impact refuses duplicated pairs, summary-only artifacts and implicit model-group merging',()=>{
  const f=fixture(); f.runs.push(f.runs[0]);
  assert.throws(()=>normalize(f),/Duplicate/);
  assert.throws(()=>normalize({run_summary:{}}),/Summary-only/);
  const grouped=fixture(); grouped.runs.forEach(r=>r.configuration='codex_'+r.configuration);
  assert.throws(()=>normalize(grouped),/Selected configurations/);
  assert.equal(summarize(normalize(grouped,{baseline:'codex_without_skill',candidate:'codex_with_skill'})).taskClusters,2);
});
test('impact metric coverage does not silently substitute a missing duration with zero',()=>{
  const f=fixture(); delete f.runs[1].result.time_seconds;
  const s=summarize(normalize(f));
  assert.equal(s.metrics.durationSeconds.pairedObservations,1);
  assert.equal(s.metrics.durationSeconds.missingPairs,1);
  assert.equal(s.metrics.quality.pairedObservations,2);
});
test('impact exports traceable, escaped evidence without overwriting prior reports',()=>{
  const root=mkdtempSync(join(tmpdir(),'impact-report-'));
  try {
    const input=join(root,'benchmark.json'),out=join(root,'report');
    writeFileSync(input,JSON.stringify(fixture()));
    generate(input,out,{dataKind:'synthetic',note:'<script>bad()</script>'});
    const html=readFileSync(join(out,'report.html'),'utf8');
    assert.match(html,/&lt;script&gt;/);
    assert.match(html,/SYNTHETIC/);
    const evidence=JSON.parse(readFileSync(join(out,'evidence.json'),'utf8'));
    assert.equal(evidence.provenance.sourceSha256.length,64);
    assert.equal(evidence.summary.metrics.tokens.candidate,null);
    assert.match(readFileSync(join(out,'summary.svg'),'utf8'),/Observed quality regression/);
    assert.throws(()=>generate(input,out),/already exists/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
