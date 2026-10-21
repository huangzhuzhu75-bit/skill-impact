import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function auditFile(path: string): string {
  const file = resolve(path);
  if (!existsSync(file)) throw new Error(`Instruction file not found: ${file}`);
  const text = readFileSync(file,'utf8');
  const lines = text.split(/\r?\n/);
  const findings: string[] = [];
  const seen = new Map<string,number>();
  lines.forEach((line,i)=>{
    const normalized = line.trim().toLowerCase();
    if (normalized.length>25 && !normalized.startsWith('```')) {
      if (seen.has(normalized)) findings.push(`L${i+1}: repeated instruction (first appears at L${seen.get(normalized)}). Consider removing duplication.`);
      else seen.set(normalized,i+1);
    }
    if (/\b(always|never)\b/i.test(line) && line.length>180) findings.push(`L${i+1}: long absolute rule. Check scope and exceptions with an ablation task.`);
    if (/\b(api[_ -]?key|password|secret)\s*[:=]\s*\S+/i.test(line)) findings.push(`L${i+1}: possible credential assignment. Inspect locally; values are not printed.`);
    if (/[A-Z]:[\\/]|\/Users\/|\/home\//.test(line)) findings.push(`L${i+1}: machine-specific path. Check whether collaborators can use it.`);
  });
  const bytes = Buffer.byteLength(text);
  return `# Instruction audit\n\nFile: ${file}\nLines: ${lines.length}\nUTF-8 bytes: ${bytes}\nRough token estimate: ${Math.ceil(bytes/4)} (heuristic, not tokenizer usage)\n\n${findings.length ? findings.map(f=>`- ${f}`).join('\n') : '- No heuristic findings.'}\n\nStatic hints cannot establish effectiveness. Run paired tasks with and without this file. Do not delete a rule solely because this audit flags it.\n`;
}
