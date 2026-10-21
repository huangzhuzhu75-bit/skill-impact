import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tost } from '../src/core/stats.ts';
import { materializeArm, restoreArm, runScript } from '../src/core/sandbox.ts';
import { parseCodexUsage } from '../src/adapters/codex.ts';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { armStats } from '../src/core/stats.ts';
import type { RunRecord } from '../src/core/types.ts';

test('no samples cannot establish equivalence', () => assert.equal(tost([], 10).equivalent, false));
test('none arm leaves no renamed instruction in the workspace', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ctx-isolation-'));
  try {
    writeFileSync(join(dir, 'AGENTS.md'), 'private instruction');
    materializeArm(dir, 'AGENTS.md', 'none');
    assert.deepEqual(readdirSync(dir), []);
    restoreArm(dir, 'AGENTS.md', 'none');
    assert.equal(existsSync(join(dir, 'AGENTS.md')), true);
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
test('Node checks run without bash and preserve judgement exit codes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ctx-node-'));
  try {
    writeFileSync(join(dir, 'check.mjs'), 'process.exit(1)');
    assert.equal(runScript(dir, 'check.mjs', 5000), 1);
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
test('Codex current event schema records usage', () => {
  assert.deepEqual(parseCodexUsage('{"type":"turn.completed","usage":{"input_tokens":123,"output_tokens":9}}'), {tokensIn:123,tokensOut:9});
});

test('known failed-trial costs stay in accounting and partial costs stay unknown', () => {
  const record = {trials:[
    {taskId:'a',arm:'none',repeat:1,passed:true,durationMs:1,costUsd:1},
    {taskId:'b',arm:'none',repeat:1,passed:null,durationMs:1,costUsd:3}
  ]} as RunRecord;
  assert.equal(armStats(record,'none').meanCostUsd,2);
  record.trials[1].costUsd=undefined;
  assert.equal(armStats(record,'none').meanCostUsd,undefined);
});

test('gate compares selected-arm outcomes across runs, and rejects incomplete runs', () => {
  const dir=mkdtempSync(join(tmpdir(),'ctx-gate-'));
  const cli=fileURLToPath(new URL('../src/cli.ts',import.meta.url));
  try {
    const runs=join(dir,'.ctx-eval','runs'); mkdirSync(runs,{recursive:true});
    const record = (passed: boolean, complete=true) => ({complete,adapter:'fixture',contextFile:'AGENTS.md',trials:['a','b'].map(id=>({taskId:id,repeat:1,arm:'always-on',passed,durationMs:1}))});
    writeFileSync(join(runs,'baseline.json'),JSON.stringify(record(true)));
    writeFileSync(join(runs,'current.json'),JSON.stringify(record(false)));
    const args=[cli,'gate','--baseline','baseline','--current','current'];
    assert.equal(spawnSync(process.execPath,args,{cwd:dir,encoding:'utf8'}).status,1);
    writeFileSync(join(runs,'current.json'),JSON.stringify(record(false,false)));
    assert.equal(spawnSync(process.execPath,args,{cwd:dir,encoding:'utf8'}).status,2);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
