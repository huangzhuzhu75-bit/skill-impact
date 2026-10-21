import {mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';

const out=resolve(process.argv[2]??'outputs/codex-pilot');
if(existsSync(out)) throw new Error('Choose a new pilot directory.');
const repo=join(out,'repository'),tasks=join(out,'tasks');
mkdirSync(join(repo,'src'),{recursive:true});mkdirSync(join(repo,'docs'));
writeFileSync(join(repo,'README.md'),'# Codex integration pilot\n\nThree small dependency-free helper tasks. This is an integration smoke test, not evidence of ecosystem adoption or general Skill effectiveness.\n');
writeFileSync(join(repo,'AGENTS.md'),'Read docs/contracts.md before implementing helpers. Keep existing exports. Use only Node built-ins and do not change grading scripts.\n');
writeFileSync(join(repo,'docs/contracts.md'),`# Helper contracts

- parsePort(value): accept integers 1..65535 or nonempty strings of ASCII digits encoding that range. Reject floats, booleans, signed/whitespace strings, empty strings and other values by throwing TypeError. Leading zeros are accepted.
- uniqueStable(values): return a new array with duplicates removed, preserving first-occurrence order using SameValueZero equality (NaN equals NaN). Do not mutate input.
- sumCents(values): sum integer cents. Reject non-safe integers, nonarrays, and sums outside the safe integer range with TypeError. Negative safe integers are allowed. Empty array gives 0.
`);
writeFileSync(join(repo,'src/helpers.mjs'),`export function parsePort(value) { throw new Error('TODO'); }
export function uniqueStable(values) { throw new Error('TODO'); }
export function sumCents(values) { throw new Error('TODO'); }
`);
const cases=[
 ['parse-port','parsePort',`assert.equal(parsePort('003000'),3000);assert.equal(parsePort(65535),65535);for(const x of [0,65536,1.1,true,'',' 80','+80','1e3']) assert.throws(()=>parsePort(x),TypeError);`],
 ['unique-stable','uniqueStable',`const input=[3,1,3,NaN,NaN,2];const copy=[...input];assert.deepEqual(uniqueStable(input),[3,1,NaN,2]);assert.deepEqual(input,copy);assert.notEqual(uniqueStable(input),input);`],
 ['sum-cents','sumCents',`assert.equal(sumCents([100,-25,5]),80);assert.equal(sumCents([]),0);for(const x of [[.1],[Infinity],[Number.MAX_SAFE_INTEGER,1],'x']) assert.throws(()=>sumCents(x),TypeError);`]
];
for(const [id,fn,checks] of cases) {
 const dir=join(tasks,id);mkdirSync(join(dir,'checks'),{recursive:true});
 writeFileSync(join(dir,'task.json'),JSON.stringify({id,title:`Implement ${fn}`,checks:['checks/check.mjs']},null,2));
 writeFileSync(join(dir,'prompt.md'),`Implement ${fn} in src/helpers.mjs according to docs/contracts.md. Preserve the other exported functions. Do not change the contract or checks.\n`);
 writeFileSync(join(dir,'checks/check.mjs'),`import assert from 'node:assert/strict';import {${fn}} from '../src/helpers.mjs';try {${checks} process.exit(0);}catch(error){console.error(error.message);process.exit(1);}`);
}
execFileSync('git',['init','-q'],{cwd:repo});
execFileSync('git',['add','.'],{cwd:repo});
execFileSync('git',['-c','user.name=ctx-eval pilot','-c','user.email=pilot@example.invalid','commit','-qm','Integration pilot baseline'],{cwd:repo});
writeFileSync(join(out,'PILOT.md'),`# Prepared integration pilot

No model calls have been made by this preparation script.

Planned scope: 3 tasks × 2 arms × 1 repeat = 6 Codex runs using the existing default model/account. Dollar cost is unknown. This small set verifies harness plumbing and cannot establish statistically generalizable improvement.

After authorization:

node src/cli.ts run --repo "${repo}" --tasks "${tasks}" --arms none,always-on --repeats 1 --timeout 120000

Set CTX_EVAL_CODEX_BIN if the existing executable is outside PATH. Preserve raw outputs locally; redact before any public release. Global instructions/history remain potential confounders. External checks are restored after execution but are not hidden from the agent.
`);
console.log(`Pilot prepared; no model calls.\nRepository: ${repo}\nTasks: ${tasks}`);
