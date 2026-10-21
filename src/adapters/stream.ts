import {spawn,spawnSync} from 'node:child_process';
import {openSync,writeSync,closeSync} from 'node:fs';
import {binary} from './util.ts';

export interface StreamResult {
  exitCode: number|null;
  timedOut: boolean;
  error?: string;
  stderr: string;
  malformedLines: number;
}

/** Bounded JSONL reader. Raw bytes are persisted incrementally, not buffered in memory. */
export function runJsonlProcess(command:string,args:string[],options:{cwd:string;timeoutMs:number;transcriptPath:string;onEvent:(event:Record<string,unknown>)=>void;maxBytes?:number;maxLineBytes?:number}):Promise<StreamResult> {
  return new Promise((resolve,reject)=>{
    let fd:number;
    try {fd=openSync(options.transcriptPath,'wx');} catch(error){reject(error);return;}
    let pending='',stderr='',bytes=0,timedOut=false,malformedLines=0,error:string|undefined;
    const child=spawn(binary(command),args,{cwd:options.cwd,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
    const stop=()=>{
      if(process.platform==='win32'&&child.pid) spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
      else child.kill('SIGKILL');
    };
    const timer=setTimeout(()=>{timedOut=true;error='Agent process timed out';stop();},options.timeoutMs);
    const line=(value:string)=>{
      if(!value.trim()) return;
      try {const event=JSON.parse(value);if(event&&typeof event==='object'&&!Array.isArray(event)) options.onEvent(event);else malformedLines++;}
      catch {malformedLines++;}
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data',(chunk:string)=>{
      if(error) return;
      bytes+=Buffer.byteLength(chunk);
      if(bytes>(options.maxBytes??64*1024*1024)){error='Agent output exceeded raw transcript limit';stop();return;}
      try {writeSync(fd,chunk);} catch {error='Cannot persist agent transcript';stop();return;}
      pending+=chunk;
      let idx:number;
      while((idx=pending.indexOf('\n'))>=0) {const value=pending.slice(0,idx);pending=pending.slice(idx+1);if(Buffer.byteLength(value)>(options.maxLineBytes??1024*1024)){error='Agent JSONL line exceeded limit';stop();return;}line(value);}
      if(Buffer.byteLength(pending)>(options.maxLineBytes??1024*1024)){error='Agent JSONL line exceeded limit';stop();}
    });
    child.stderr.on('data',(chunk:string)=>{stderr=(stderr+chunk).slice(-4096);});
    child.on('error',e=>{error=`Cannot start agent process: ${(e as NodeJS.ErrnoException).code??'unknown'}`;});
    child.on('close',code=>{
      clearTimeout(timer);
      if(!error&&pending.trim()) line(pending);
      closeSync(fd);
      resolve({exitCode:code,timedOut,error,stderr,malformedLines});
    });
  });
}
