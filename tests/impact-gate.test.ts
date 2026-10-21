import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePolicy,renderPrSummary} from '../skills/skill-impact/scripts/gate.mjs';

function evidence() {
 const m=(b,c)=>({baseline:b,candidate:c,delta:c-b,pairedObservations:4,missingPairs:0});
 return {provenance:{dataKind:'unverified-import',sourceSha256:'a'.repeat(64)},dataset:{warnings:[],qualityLabel:'Task success rate'},summary:{taskClusters:4,metrics:{quality:m(1,1),durationSeconds:m(10,10),tokens:m(100,100),costUsd:{baseline:null,candidate:null,delta:null,pairedObservations:0,missingPairs:4}}}};
}
test('regression gate cannot pass synthetic data without an explicit demo flag',()=>{
 const e=evidence();e.provenance.dataKind='synthetic';
 assert.equal(evaluatePolicy(e).exitCode,2);
 assert.equal(evaluatePolicy(e,{allowSynthetic:true}).exitCode,0);
});
test('regression gate rejects missing required data and detects slower candidate',()=>{
 const e=evidence();e.summary.metrics.durationSeconds.candidate=13;e.summary.metrics.durationSeconds.delta=3;
 assert.equal(evaluatePolicy(e).exitCode,1);
 e.summary.metrics.durationSeconds.missingPairs=1;
 assert.equal(evaluatePolicy(e).exitCode,2);
});
test('regression gate catches quality loss even when candidate becomes faster',()=>{
 const e=evidence();e.summary.metrics.quality.candidate=.9;e.summary.metrics.quality.delta=-.1;
 e.summary.metrics.durationSeconds.candidate=5;e.summary.metrics.durationSeconds.delta=-5;
 const p=evaluatePolicy(e);assert.equal(p.exitCode,1);assert.match(p.failures.join(' '),/Quality/);
 assert.match(renderPrSummary(e,p),/Unknown/);
});
test('regression policy validates its thresholds instead of silently passing NaN',()=>{
 assert.throws(()=>evaluatePolicy(evidence(),{maxQualityDropPp:NaN}),/Invalid/);
 assert.throws(()=>evaluatePolicy(evidence(),{required:['nonexistent']}),/Unknown required/);
});
