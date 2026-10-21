import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialize, evaluate, grade } from '../skills/prompt-lab/scripts/evaluate.mjs';

test('prompt rubric rejects fenced JSON and excluded strings', () => {
  assert.equal(grade('```json\n{"a":1}\n```',{jsonKeys:['a']}).passed,false);
  assert.equal(grade('Hello!',{contains:['Hello'],maxChars:6,excludes:['bye']}).passed,true);
});
test('saved-output report preserves missing outputs, provenance, hashes and escaping', () => {
  const root = mkdtempSync(join(tmpdir(),'prompt-lab-test-'));
  const dir = join(root,'evaluation');
  try {
    initialize(dir);
    const first = evaluate(dir);
    assert.equal(first.pairedCases,3);
    assert.equal(first.wins,2);
    assert.equal(first.costUsd,null);
    assert.equal(first.prompts.a.sha256.length,64);
    rmSync(join(dir,'responses/b/json.txt'));
    const cfg = JSON.parse(readFileSync(join(dir,'cases.json'),'utf8'));
    cfg.provenance='<script>alert(1)</script>';
    writeFileSync(join(dir,'cases.json'),JSON.stringify(cfg));
    const missing = evaluate(dir);
    assert.equal(missing.pairedCases,2);
    assert.equal(missing.rows[0].b.passed,null);
    assert.match(readFileSync(join(dir,'report.html'),'utf8'),/&lt;script&gt;/);
    cfg.cases[0].id='../escape';
    writeFileSync(join(dir,'cases.json'),JSON.stringify(cfg));
    assert.throws(()=>evaluate(dir),/Invalid/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
