#!/usr/bin/env python3
"""
agents-md-audit —— AGENTS.md / CLAUDE.md 等 Agent 指令文件的确定性审计脚本。

零第三方依赖（Python 3.10+ stdlib）。
退出码: 0 = 没有 error 级发现; 1 = 存在 error 级发现; 2 = 用法/文件错误。

用法:
    python3 audit.py <file> [--root <repo>] [--format json|text]

检查项:
    SIZE_CODE_32K   Codex 的 project_doc_max_bytes 默认上限 32 KiB（error）
    SIZE_LINES_200  Anthropic 建议 < 200 行（warn）
    SECRETS         常见密钥格式（error）
    EMPTY           文件为空或接近空（warn）
    PLATITUDE       模糊空话（warn）
    STALE_YEAR      过期年份引用（info）
    TODO_FIXME      TODO/FIXME 标记密度（info）
    DEAD_PATH       反引号引用的相对路径不存在（error，需 --root）
    DEAD_SCRIPT     npm run <script> 在 package.json 中不存在（error，需 --root）

本脚本仅提供静态检查与启发式提示；不能证明指令文件有效或无效。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

CODE_CAP_BYTES = 32 * 1024  # Codex project_doc_max_bytes 默认值
LINE_TARGET = 200           # Anthropic 对 CLAUDE.md 的建议长度

SECRET_PATTERNS = [
    ("openai-key", re.compile(r"sk-[A-Za-z0-9_\-]{20,}")),
    ("anthropic-key", re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}")),
    ("aws-access-key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("github-token", re.compile(r"gh[pousr]_[A-Za-z0-9]{36,}")),
    ("slack-token", re.compile(r"xox[baprs]-[A-Za-z0-9\-]{10,}")),
    ("google-api-key", re.compile(r"AIza[0-9A-Za-z_\-]{35}")),
    ("private-key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
]

PLATITUDES = [
    "write clean code",
    "clean, maintainable code",
    "follow best practices",
    "be helpful",
    "use common sense",
    "as needed",
    "when appropriate",
    "high quality",
    "industry standard",
]

# 反引号中的相对路径，如 `./src/foo` 或 `src/lib/bar.ts`
PATH_RE = re.compile(r"`((?:\./|\.\./|[A-Za-z0-9_\-]+/)[^\s`]+)`")
NPM_SCRIPT_RE = re.compile(r"npm run ([A-Za-z0-9_\-:]+)")
YEAR_RE = re.compile(r"\b(20\d\d)\b")


def check_file(path: Path, root: Path | None) -> list[dict]:
    findings: list[dict] = []

    if not path.is_file():
        return [{"id": "FILE_MISSING", "severity": "error", "message": f"file not found: {path}"}]

    text = path.read_text(encoding="utf-8", errors="replace")
    size = path.stat().st_size
    lines = text.splitlines()
    non_ws = "".join(text.split())

    if len(non_ws) < 100:
        findings.append({
            "id": "EMPTY", "severity": "warn",
            "message": f"file is nearly empty ({len(non_ws)} non-whitespace chars)",
        })

    if size > CODE_CAP_BYTES:
        findings.append({
            "id": "SIZE_CODE_32K", "severity": "error",
            "message": f"{size} bytes exceeds Codex project_doc_max_bytes cap ({CODE_CAP_BYTES}); "
                       "Codex silently stops loading instruction files past the cap",
        })
    if len(lines) > LINE_TARGET:
        findings.append({
            "id": "SIZE_LINES_200", "severity": "warn",
            "message": f"{len(lines)} lines exceeds the 200-line target (Anthropic guidance); "
                       "long files dilute adherence",
        })

    for name, pattern in SECRET_PATTERNS:
        for m in pattern.finditer(text):
            line_no = text[: m.start()].count("\n") + 1
            findings.append({
                "id": "SECRETS", "severity": "error", "line": line_no,
                "message": f"possible {name} committed in the instruction file "
                           f"({m.group(0)[:8]}…). Remove it and rotate the credential",
            })

    for i, line in enumerate(lines, start=1):
        low = line.lower()
        for p in PLATITUDES:
            if p in low:
                findings.append({
                    "id": "PLATITUDE", "severity": "warn", "line": i,
                    "message": f'vague platitude "{p}" — replace with a checkable rule or delete',
                })
                break

    current_year = int(os.environ.get("CTX_EVAL_YEAR") or __import__("datetime").date.today().year)
    stale = sorted({int(y) for y in YEAR_RE.findall(text) if int(y) <= current_year - 2})
    if stale:
        findings.append({
            "id": "STALE_YEAR", "severity": "info",
            "message": f"references to old years {stale} — verify they are still accurate",
        })

    todo = sum(low.count("todo") + low.count("fixme") for low in (l.lower() for l in lines))
    if todo >= 3:
        findings.append({
            "id": "TODO_FIXME", "severity": "info",
            "message": f"{todo} TODO/FIXME markers — finish or remove them",
        })

    if root is not None:
        for i, line in enumerate(lines, start=1):
            for m in PATH_RE.finditer(line):
                rel = m.group(1)
                if "*" in rel or rel.startswith("http"):
                    continue
                if not (root / rel).exists():
                    findings.append({
                        "id": "DEAD_PATH", "severity": "error", "line": i,
                        "message": f"referenced path does not exist: {rel}",
                    })
        pkg = root / "package.json"
        if pkg.is_file():
            try:
                scripts = json.loads(pkg.read_text(encoding="utf-8")).get("scripts", {})
            except json.JSONDecodeError:
                scripts = {}
            for i, line in enumerate(lines, start=1):
                for m in NPM_SCRIPT_RE.finditer(line):
                    name = m.group(1)
                    if name not in scripts:
                        findings.append({
                            "id": "DEAD_SCRIPT", "severity": "error", "line": i,
                            "message": f"npm run {name} is not defined in package.json",
                        })

    return findings


def score(findings: list[dict]) -> int:
    penalty = sum({"error": 15, "warn": 5, "info": 1}.get(f["severity"], 0) for f in findings)
    return max(0, 100 - penalty)


def main() -> int:
    ap = argparse.ArgumentParser(description="Deterministic audit for agent instruction files")
    ap.add_argument("file", help="path to AGENTS.md / CLAUDE.md / …")
    ap.add_argument("--root", default=None, help="repo root, enables dead-path/dead-script checks")
    ap.add_argument("--format", choices=["json", "text"], default="text")
    args = ap.parse_args()

    path = Path(args.file)
    root = Path(args.root).resolve() if args.root else None
    findings = check_file(path, root)
    result = {
        "file": str(path),
        "score": score(findings),
        "errors": sum(1 for f in findings if f["severity"] == "error"),
        "warnings": sum(1 for f in findings if f["severity"] == "warn"),
        "infos": sum(1 for f in findings if f["severity"] == "info"),
        "findings": findings,
    }

    if args.format == "json":
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(f"{path}: {result['score']}/100 "
              f"({result['errors']} errors, {result['warnings']} warnings, {result['infos']} infos)")
        for f in findings:
            loc = f":{f['line']}" if f.get("line") else ""
            print(f"  [{f['severity']:5}] {f['id']}{loc} — {f['message']}")

    return 1 if result["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
