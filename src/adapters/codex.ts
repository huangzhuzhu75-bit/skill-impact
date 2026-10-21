import {mkdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {AdapterRunInput,AdapterRunOutput,AgentAdapter} from './types.ts';
import {hasBinary} from './util.ts';
import {runJsonlProcess} from './stream.ts';

export class CodexUsageTracker {
  tokensIn:number|undefined;
  tokensOut:number|undefined;
  completedTurns=0;
  failed=false;
  accept(event:Record<string,unknown>):void {
    if(event.type==='turn.failed'||event.type==='error') this.failed=true;
    const info=event.info as Record<string,unknown>|undefined;
    const usage=(event.usage??info?.usage??info?.total_token_usage) as Record<string,unknown>|undefined;
    if(!usage) return;
    const input=usage.input_tokens??usage.input,output=usage.output_tokens??usage.output;
    const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
    if(!valid(input)||!valid(output)) return;
    if(event.type==='turn.completed') {
      if(this.completedTurns===0) {this.tokensIn=0;this.tokensOut=0;}
      this.tokensIn=(this.tokensIn??0)+input;this.tokensOut=(this.tokensOut??0)+output;this.completedTurns++;
    } else if(this.completedTurns===0) {this.tokensIn=input;this.tokensOut=output;}
  }
  usage():{tokensIn?:number;tokensOut?:number} {return {tokensIn:this.tokensIn,tokensOut:this.tokensOut};}
}

export class CodexAdapter implements AgentAdapter {
  name='codex';
  async available():Promise<boolean> {return hasBinary('codex');}
  installHint():string {return 'Provide codex on PATH or set CTX_EVAL_CODEX_BIN to an existing executable.';}
  async run(input:AdapterRunInput):Promise<AdapterRunOutput> {
    const started=Date.now();
    const rawDir=input.transcriptDir??join(dirname(input.worktree),'.ctx-eval-raw');mkdirSync(rawDir,{recursive:true});
    const transcriptPath=join(rawDir,`codex-${input.arm}-${randomUUID()}.jsonl`);
    const tracker=new CodexUsageTracker();
    const args=['exec','--json','--ephemeral','--sandbox','workspace-write','--skip-git-repo-check'];
    if(input.model) args.push('--model',input.model);
    args.push('--',input.prompt);
    const proc=await runJsonlProcess('codex',args,{cwd:input.worktree,timeoutMs:input.timeoutMs,transcriptPath,onEvent:event=>tracker.accept(event)});
    const output:AdapterRunOutput={durationMs:Date.now()-started,exitCode:proc.exitCode,transcriptPath,...tracker.usage(),completed:proc.exitCode===0&&tracker.completedTurns>0&&!tracker.failed};
    if(proc.error) output.error=proc.error;
    else if(proc.exitCode!==0) output.error=`Codex exited with status ${proc.exitCode}; inspect its local transcript.`;
    else if(tracker.failed) output.error='Codex emitted a failed/error event.';
    else if(tracker.completedTurns===0||output.tokensIn===undefined||output.tokensOut===undefined) output.error='Missing completed turn or valid usage; this trial cannot be verified.';
    return output;
  }
}

export function parseCodexUsage(stdout:string):{tokensIn?:number;tokensOut?:number} {
  const tracker=new CodexUsageTracker();
  for(const line of stdout.split('\n')) {try {tracker.accept(JSON.parse(line));}catch{/* Non-JSON lines do not contain usage. */}}
  return tracker.usage();
}
