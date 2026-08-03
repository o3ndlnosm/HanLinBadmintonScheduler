#!/usr/bin/env bash
# 產生各隊隊長 QR code（輸出到 qr/，勿 commit——內含 captain token）
# 用法：./scripts/generate-qr.sh <頁面base網址> <A隊token> <B隊token> <C隊token> <D隊token> <E隊token>
# 例：  ./scripts/generate-qr.sh https://o3ndlnosm.github.io/HanLinBadmintonScheduler aaa bbb ccc ddd eee
set -euo pipefail

if [ "$#" -ne 6 ]; then
  echo "用法：$0 <base網址> <A token> <B token> <C token> <D token> <E token>" >&2
  exit 1
fi

BASE="${1%/}"
shift
LETTERS=(A B C D E)
mkdir -p qr

i=0
for token in "$@"; do
  letter="${LETTERS[$i]}"
  url="${BASE}/tournament.html?c=${token}"
  npx --yes qrcode -o "qr/captain-${letter}.png" -w 600 "$url"
  echo "qr/captain-${letter}.png ← ${url}"
  i=$((i + 1))
done
echo "完成。觀賽連結請另用 ?t=<public_token> 分享。"
