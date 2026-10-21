#!/usr/bin/env bash
# 判定脚本：退出码 0 = 通过，1 = 未通过，>= 2 = 脚本错误（记 null，不计入成功率）
set -u
if [[ ! -f hello.txt ]]; then
  echo "hello.txt not found"
  exit 1
fi
content="$(cat hello.txt)"
if [[ "$content" == "hello from agent" ]]; then
  echo "pass"
  exit 0
fi
echo "unexpected content: $content"
exit 1
