import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const out=resolve(process.argv[2]??'outputs/impact-source-fixture');
if(existsSync(out)) throw new Error('Use a new fixture directory');
const patterns=[{b:.5,c:1},{b:1,c:1},{b:1,c:.5},{b:0,c:.5}];
for(let i=0;i<patterns.length;i++) {
  for(const config of ['with_skill','without_skill']) for(let repeat=1;repeat<=2;repeat++) {
    const dir=join(out,`eval-${i+1}`,config,`run-${repeat}`);
    mkdirSync(dir,{recursive:true});
    const withSkill=config==='with_skill', rate=patterns[i][withSkill?'c':'b'];
    const grade={summary:{pass_rate:rate,passed:2*rate,failed:2*(1-rate),total:2},expectations:[{text:'Synthetic compatibility assertion',passed:rate===1,evidence:'Hand-authored fixture; not executed by a model'}],execution_metrics:{total_tool_calls:withSkill?3:5,errors_encountered:0}};
    const timing={total_tokens:(withSkill?1200:1500)+50*i+repeat,total_duration_seconds:(withSkill?12:16)+i+repeat*.1};
    writeFileSync(join(dir,'grading.json'),JSON.stringify(grade,null,2));
    writeFileSync(join(dir,'timing.json'),JSON.stringify(timing,null,2));
  }
}
writeFileSync(join(out,'FIXTURE-NOTICE.md'),'# Synthetic compatibility fixture\n\nAll grades, durations, tokens and tool-call counts are handwritten. No model was run. Used only to test the upstream aggregator and downstream importer.\n');
console.log(out);
