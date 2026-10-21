import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runJsonlProcess} from '../src/adapters/stream.ts';
import {CodexUsageTracker,parseCodexUsage} from '../src/adapters/codex.ts';

test('usage tracker sums completed turns and rejects invalid telemetry',()=>{
 const tracker=new CodexUsageTracker();
 tracker.accept({type:'turn.completed',usage:{input_tokens:10,output_tokens:2}});
 tracker.accept({type:'turn.completed',usage:{input_tokens:20,output_tokens:3}});
 assert.deepEqual(tracker.usage(),{tokensIn:30,tokensOut:5});
 assert.deepEqual(parseCodexUsage('{"usage":{"input_tokens":-1,"output_tokens":2}}'),{tokensIn:undefined,tokensOut:undefined});
 tracker.accept({type:'turn.failed'});assert.equal(tracker.failed,true);
});
test('stream parser handles fragmented JSONL, final lines and persists raw output',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ctx-stream-'));
 try {
  const events=[],path=join(dir,'raw.jsonl');
  const code=`process.stdout.write('{"type":"turn.'); setTimeout(()=>{process.stdout.write('completed","usage":{"input_tokens":4,"output_tokens":2}}\\nnot json\\n{"last":true}');},10);`;
  const result=await runJsonlProcess(process.execPath,['-e',code],{cwd:dir,timeoutMs:5000,transcriptPath:path,onEvent:e=>events.push(e)});
  assert.equal(result.exitCode,0);assert.equal(events.length,2);assert.equal(result.malformedLines,1);
  assert.match(readFileSync(path,'utf8'),/input_tokens/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('stream output cap stops runaway output rather than exhausting memory',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ctx-stream-limit-'));
 try {
  const result=await runJsonlProcess(process.execPath,['-e',`process.stdout.write('x'.repeat(4096));`],{cwd:dir,timeoutMs:5000,transcriptPath:join(dir,'raw'),onEvent:()=>{},maxBytes:128});
  assert.match(result.error??'',/limit/);
 }finally {rmSync(dir,{recursive:true,force:true});}
});
