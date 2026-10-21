import { compareArms } from './stats.ts';
import type { RunRecord, ComparisonReport } from './types.ts';

export const escapeHtml = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function verdict(record: RunRecord, c: ComparisonReport): string {
  if (!record.complete) return 'Incomplete experiment';
  const clusters = new Set(record.trials.filter(t => t.passed !== null).map(t => t.taskId)).size;
  if (c.pairs < 2 || clusters < 2) return 'Insufficient evidence';
  if (c.tost.equivalent) return 'Within equivalence margin';
  if (c.tost.ci95[0] > 0) return 'Measured improvement';
  if (c.tost.ci95[1] < 0) return 'Measured harm';
  return 'Inconclusive — collect more tasks';
}

export function renderHtml(record: RunRecord, margin = 10): string {
  const arms = [...new Set(record.trials.map(t => t.arm))];
  const c = compareArms(record, arms.at(-1) ?? 'always-on', arms[0] ?? 'none', margin);
  const esc = escapeHtml;
  const demo = record.adapter === 'demo-scripted';
  const infra = record.trials.filter(t => t.passed === null).length;
  const tasks = [...new Set(record.trials.map(t => t.taskId))];
  const rows = tasks.map(id => `<tr><th>${esc(id)}</th>${arms.map(a => {
    const ts = record.trials.filter(t => t.taskId === id && t.arm === a);
    return `<td>${ts.map(t => `<span class="pill ${t.passed === null ? 'error' : t.passed ? 'pass' : 'fail'}" title="${esc(t.error ?? `repeat ${t.repeat}`)}">${t.passed === null ? 'ERROR' : t.passed ? 'PASS' : 'FAIL'}</span>`).join(' ')}</td>`;
  }).join('')}</tr>`).join('');
  const cards = c.arms.map(a => {
    const ts = record.trials.filter(t => t.arm === a.arm);
    const tokens = ts.filter(t => t.tokensIn !== undefined && t.tokensOut !== undefined);
    const cost = ts.every(t => t.costUsd !== undefined) ? `$${ts.reduce((s,t)=>s+t.costUsd!,0).toFixed(4)}` : 'Unknown';
    return `<article><span class="eyebrow">${esc(a.arm)}</span><div class="rate">${a.n ? Math.round(a.passRate*100)+'%' : '—'}</div><p>${a.passed} / ${a.n} valid trials passed</p><div class="track"><div style="width:${a.passRate*100}%"></div></div><dl><dt>Total cost</dt><dd>${cost}</dd><dt>Input / output tokens</dt><dd>${tokens.length === ts.length ? `${ts.reduce((s,t)=>s+t.tokensIn!,0).toLocaleString()} / ${ts.reduce((s,t)=>s+t.tokensOut!,0).toLocaleString()}` : 'Unknown'}</dd></dl></article>`;
  }).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>ctx-eval · Experiment report</title>
<style>
:root{color-scheme:dark;--bg:#10151c;--panel:#19212c;--line:#303d4d;--text:#edf3fa;--muted:#a9b7c9;--mint:#79e2bf;--amber:#ffd18b}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,sans-serif}main{max-width:1180px;margin:auto;padding:44px 28px}header{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid var(--line);padding-bottom:22px}.brand{font-size:23px;font-weight:750;letter-spacing:-1px}.badge,.pill{border:1px solid var(--line);border-radius:6px;padding:4px 9px;font-size:12px}.badge{color:var(--amber)}h1{font-size:clamp(30px,5vw,53px);line-height:1.13;letter-spacing:-1.7px;margin:38px 0 14px;max-width:820px}p,.muted{color:var(--muted)}.notice{border-left:3px solid var(--amber);padding:12px 18px;background:#27251f;margin:26px 0}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin:26px 0}article,.result{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:25px}.eyebrow{text-transform:uppercase;letter-spacing:2px;font-size:12px;color:var(--mint)}.rate{font-size:62px;line-height:1.3;font-weight:700;letter-spacing:-3px}.track{height:9px;background:#0c1118;border-radius:8px;margin:22px 0}.track>div{background:var(--mint);height:100%;border-radius:8px}dl{display:grid;grid-template-columns:1fr auto;gap:12px;font-size:14px}dt{color:var(--muted)}dd{margin:0}.result h2{margin:8px 0}.metric{font-size:28px;color:var(--mint)}section{margin:30px 0}h2{font-size:21px}.tablewrap{overflow:auto}table{border-collapse:collapse;width:100%;text-align:left}th,td{padding:14px 12px;border-bottom:1px solid var(--line)}th{font-weight:500}.pass{color:var(--mint);background:#12362d}.fail{color:#ffaaa9;background:#3c242a}.error{color:var(--amber)}details{border:1px solid var(--line);padding:18px;border-radius:10px;margin:16px 0}summary{cursor:pointer}code{overflow-wrap:anywhere;color:#c9d8ea}footer{font-size:13px;color:var(--muted);margin-top:35px}@media(max-width:600px){main{padding:24px 16px}header{flex-direction:column}.rate{font-size:48px}dl{grid-template-columns:1fr}dd{margin-bottom:8px}}@media print{body{background:white;color:black}article,.result{background:#eee;color:black}p{color:#333}}
</style><main><header><div class="brand">ctx-eval <span class="muted">/ evidence over intuition</span></div><span class="badge">${demo ? 'SCRIPTED DEMO · NOT MODEL EVIDENCE' : 'LOCAL EXPERIMENT'}</span></header>
<h1>Does your AGENTS.md<br>earn its tokens?</h1><p>A paired experiment on your tasks. Success, uncertainty and cost in one place.</p>
${demo ? '<div class="notice"><strong>Demonstration only.</strong> A deterministic scripted agent ran real worktrees and checks. These outcomes illustrate the evaluator; they say nothing about real coding-model effectiveness. Token counts are illustrative; no API was called.</div>' : ''}
<div class="cards">${cards}</div><div class="result"><span class="eyebrow">${demo ? 'Demonstration outcome' : 'Evidence assessment'}</span><h2>${esc(verdict(record,c))}</h2><div class="metric">${c.pairs ? (c.passRateDiffPp>=0?'+':'')+c.passRateDiffPp.toFixed(1)+' percentage points' : 'No valid pairs'}</div><p>${esc(c.arm)} versus ${esc(c.baseline)} · ${c.pairs} paired observations · ${tasks.length} tasks · ${infra} infrastructure errors</p><p>${c.pairs ? `95% cluster-bootstrap interval: [${c.tost.ci95.map(n=>n.toFixed(1)).join(', ')}] pp · equivalence margin ±${margin} pp.` : 'Confidence interval unavailable.'}</p><p>${c.pairs && c.tost.ci95[0] <= 0 && c.tost.ci95[1] >= 0 && !c.tost.equivalent ? 'The interval crosses zero. A positive point estimate alone is not evidence of improvement.' : 'Results apply to these tasks and this harness; repeat with diverse tasks before changing policy.'}</p></div>
<section><h2>Where did instructions help or hurt?</h2><p>Each badge is one independently checked trial. Errors are excluded from success rates, but their known costs are retained.</p><div class="tablewrap"><table><thead><tr><th>Task</th>${arms.map(a=>`<th>${esc(a)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></section>
<details><summary>Reproducibility & limits</summary><p>Adapter: <code>${esc(record.adapter)}</code> · requested model: <code>${esc(record.model ?? 'adapter default')}</code></p><p>Base: <code>${esc(record.baseCommit)}</code><br>Run: <code>${esc(record.runId)}</code><br>Started: ${esc(record.startedAt)}<br>Finished: ${esc(record.finishedAt)}</p><p>Complete: ${record.complete}. Unknown dollar cost is never treated as zero. Worktrees isolate file changes, not secrets or hostile processes. Selected-file ablation does not prevent access to Git history, ancestor instructions, global skills or other instruction files. Bootstrap intervals may collapse when all observed differences match; this is not proof of general equivalence.</p></details>
<details><summary>What to do next</summary><p>Inspect tasks with differing outcomes. Keep useful operational facts; test any removal against your own tasks. Add independent tasks when the result is inconclusive. Use a held-out task set before adopting optimized instructions.</p><p>Re-run: <code>node src/cli.ts run --repo YOUR_REPO --tasks YOUR_TASKS --arms none,always-on --repeats 3</code></p></details><footer>Local file · no analytics, CDN, external fonts or network requests · ctx-eval</footer></main></html>`;
}
