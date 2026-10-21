#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const [command,...args]=process.argv.slice(2);
const usage=`Skill Impact — auditable reports for agent benchmarks

Usage:
  node bin/skill-impact.mjs demo --out NEW_DIR
  node bin/skill-impact.mjs report --input FILE --out NEW_DIR [options]
  node bin/skill-impact.mjs gate --evidence FILE [options]
  node bin/skill-impact.mjs doctor
  node bin/skill-impact.mjs legacy <ctx-eval command> [options]

Demo/report/gate are offline and make no model calls.
See docs/input-formats.md and docs/regression-policy.md for options.
`;
if(!command||['help','--help','-h'].includes(command)){console.log(usage);process.exit(0);}
let script,childArgs=args;
switch(command){
 case 'report': script='skills/skill-impact/scripts/report.mjs';break;
 case 'gate': script='skills/skill-impact/scripts/gate.mjs';break;
 case 'demo': {
  const i=args.indexOf('--out');
  if(i<0||!args[i+1]){console.error('demo requires --out NEW_DIR');process.exit(2);}
  script='skills/skill-impact/scripts/report.mjs';
  childArgs=['--input',resolve(root,'examples/impact/synthetic-benchmark.json'),'--out',resolve(args[i+1]),'--data-kind','synthetic','--note','Synthetic compatibility demonstration. No model was run.'];break;
 }
 case 'doctor':script='src/cli.ts';childArgs=['doctor'];break;
 case 'legacy':script='src/cli.ts';break;
 default:console.error(`Unknown command: ${command}\n${usage}`);process.exit(2);
}
const result=spawnSync(process.execPath,[resolve(root,script),...childArgs],{stdio:'inherit',shell:false,windowsHide:true});
if(result.error) console.error(result.error.message);
process.exit(result.status??2);
