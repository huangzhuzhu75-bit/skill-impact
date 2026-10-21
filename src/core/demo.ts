import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runExperiment } from './runner.ts';
import { DEFAULT_CONFIG } from './config.ts';
import type { Task, RunRecord } from './types.ts';
import type { AgentAdapter } from '../adapters/types.ts';
import { compareArms } from './stats.ts';
import { renderHtml } from './dashboard.ts';
import { renderMarkdown } from './report.ts';

export async function runDemo(destination: string): Promise<string> {
  const root = resolve(destination);
  if (existsSync(root)) throw new Error(`Demo destination already exists: ${root}. Choose a new --out directory.`);
  mkdirSync(root, {recursive:true});
  const repo = join(root, 'repository');
  mkdirSync(repo);
  writeFileSync(join(repo, 'AGENTS.md'), 'For this demo, the required output style is modern.\n');
  writeFileSync(join(repo, 'README.md'), '# Scripted evaluator demo\n');
  execFileSync('git',['init','-q'],{cwd:repo});
  execFileSync('git',['add','.'],{cwd:repo});
  execFileSync('git',['-c','user.name=ctx-eval demo','-c','user.email=demo@example.invalid','commit','-qm','Demo fixture'],{cwd:repo});
  const tasks: Task[] = [];
  for (let i=0; i<12; i++) {
    const kind = i<6 ? 'helpful' : i<10 ? 'redundant' : 'harmful';
    const id = `${kind}-${String(i+1).padStart(2,'0')}`;
    const dir = join(root,'tasks',id);
    mkdirSync(join(dir,'checks'),{recursive:true});
    const expected = kind==='harmful' ? 'legacy' : 'modern';
    const fallback = kind==='redundant' ? 'modern' : 'legacy';
    const meta = {id,title:`${kind} instruction example`,checks:['checks/check.mjs']};
    writeFileSync(join(dir,'task.json'),JSON.stringify(meta,null,2));
    const prompt = `Write output.txt. Default style: ${fallback}. Follow AGENTS.md when present.`;
    writeFileSync(join(dir,'prompt.md'),prompt);
    writeFileSync(join(dir,'checks/check.mjs'),`import {readFileSync,existsSync} from 'node:fs'; process.exit(existsSync('output.txt') && readFileSync('output.txt','utf8') === ${JSON.stringify(expected)} ? 0 : 1);`);
    tasks.push({dir,meta,prompt});
  }
  const adapter: AgentAdapter = {
    name:'demo-scripted', available:async()=>true, installHint:()=>'',
    async run(input) {
      const file = join(input.worktree,'AGENTS.md');
      const instructions = existsSync(file) ? readFileSync(file,'utf8') : '';
      const output = instructions.includes('modern') ? 'modern' : input.prompt.match(/Default style: (\w+)/)![1];
      writeFileSync(join(input.worktree,'output.txt'),output);
      return {exitCode:0,completed:true,durationMs:1,costUsd:0,tokensIn:instructions ? 140:100,tokensOut:8};
    }
  };
  const record = await runExperiment({repoRoot:repo,baseCommit:'HEAD',tasks,config:{...DEFAULT_CONFIG,repeats:2},adapter,
    onTrial:t=>console.log(`  ${t.passed===null?'ERROR':t.passed?'PASS':'FAIL'} ${t.taskId} / ${t.arm} / ${t.repeat}`)});
  writeFileSync(join(root,'run.json'),JSON.stringify(record,null,2));
  writeFileSync(join(root,'report.html'),renderHtml(record));
  writeFileSync(join(root,'report.md'),renderMarkdown(record,compareArms(record,'always-on','none',10)));
  return join(root,'report.html');
}
