import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const cli=fileURLToPath(new URL('../bin/skill-impact.mjs',import.meta.url));
test('public CLI runs an offline demo from another working directory and rejects synthetic gating',()=>{
 const root=mkdtempSync(join(tmpdir(),'skill-impact-public-'));
 try {
  const out=join(root,'demo');
  const run=spawnSync(process.execPath,[cli,'demo','--out',out],{cwd:root,encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const evidence=JSON.parse(readFileSync(join(out,'evidence.json'),'utf8'));
  assert.equal(evidence.provenance.dataKind,'synthetic');
  assert.equal(evidence.summary.metrics.quality.pairedObservations,8);
  assert.equal(spawnSync(process.execPath,[cli,'gate','--evidence',join(out,'evidence.json')],{encoding:'utf8'}).status,2);
  assert.equal(spawnSync(process.execPath,[cli,'demo','--out',out],{encoding:'utf8'}).status,2);
 }finally {rmSync(root,{recursive:true,force:true});}
});
test('public CLI exposes help and rejects an unknown command',()=>{
 assert.equal(spawnSync(process.execPath,[cli,'--help'],{encoding:'utf8'}).status,0);
 assert.equal(spawnSync(process.execPath,[cli,'nonexistent'],{encoding:'utf8'}).status,2);
});
