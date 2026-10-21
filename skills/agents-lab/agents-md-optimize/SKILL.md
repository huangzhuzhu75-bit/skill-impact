---
name: agents-md-optimize
description: Propose and evaluate focused changes to AGENTS.md or CLAUDE.md while preserving user constraints. Use when optimizing agent instructions or identifying rules worth keeping.
license: MIT
---

# Instruction refinement

Read the original file and intended tasks. Preserve the original and propose one coherent candidate. Separate known execution errors, ambiguous rules, duplication and hypotheses about task behavior. Do not claim every agent failure is fixable with prose.

When measurements are authorized, use ctx-eval or the supplied prompt-lab workflow. Fix cases and checks before evaluation. Use development cases to refine, and unseen held-out cases for validation. Same-conversation examples are development feedback, not independent evidence. Do not keep or delete a rule solely on one successful run or a lint score.

Deliver candidate text/diff, per-case changes, measured tokens and known cost, plus remaining uncertainty. If no real model experiment ran, label the candidate unvalidated. Follow the user's existing edit authorization; do not impose a second approval for the same reversible work. Installation, publishing and model-spend scope remain separate.
