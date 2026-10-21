# Saved-output evaluation

Use representative examples plus edge cases. Decide the checks before generating candidate outputs. Split development and held-out cases before refining; never optimize against the held-out answers. For creative tasks, human rubric ratings may be necessary; the bundled helper cannot certify writing quality or factual accuracy.

`cases.json`:

```json
{
  "dataKind": "real-saved-outputs",
  "provenance": "Describe model/version, settings, date, generation method, task split, and whether sessions were independent.",
  "cases": [{
    "id": "json-response",
    "input": "Return a JSON object with a title and tags.",
    "checks": {"jsonKeys": ["title", "tags"], "maxChars": 200}
  }]
}
```

Supported checks:

- `contains`: array of case-sensitive literal substrings that must appear.
- `excludes`: array of case-sensitive substrings that must not appear.
- `jsonKeys`: array of required top-level keys. The entire response must parse as a JSON object; fenced JSON fails.
- `maxChars`: positive integer, counts Unicode code points after trimming outer whitespace.

Each case needs at least one check. All checks must pass. These checks do not validate JSON value types, factual correctness, tone or reasoning. Do not retrofit substring checks just to make a favored response win.

Save exact model outputs as UTF-8 files. Do not manually fix a response before grading it. Retain raw originals elsewhere if normalization is necessary and document that transformation. Use `prompts/a.md` and `prompts/b.md` for the two candidate prompts. Each case input must be supplied identically to both variants.

Missing/error outputs do not establish failure of the prompt itself. They are reported separately and excluded from paired comparisons. Partial results never justify deployment. A single output per case cannot measure model variability; repeat the experiment in a new folder with independent runs when uncertainty matters.

For coding tasks use external deterministic checks. Keep expected answers and grading scripts outside agent-visible inputs where feasible. A worktree is file-change isolation, not a security sandbox.
