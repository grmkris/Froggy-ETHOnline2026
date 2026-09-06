#!/usr/bin/env bash
# The last look before the repository goes public.
#
# Walks every commit on every branch for the shapes a leaked credential takes
# and prints each hit with its commit. Exit 1 on any hit, so it can gate the
# flip. Placeholders from .env.example are excluded by name, because they are
# supposed to be in the tree; anything else that looks like a key is a finding
# to explain, not to argue with.
#
#   bash tools/spikes/history-secret-scan.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

patterns=(
  'sk-ant-[A-Za-z0-9_-]{20,}'                        # Anthropic key
  'sk-[A-Za-z0-9]{32,}'                              # OpenAI-shaped key
  'PRIVATE_KEY=[^R][^E][^P]'                         # any PRIVATE_KEY= that is not REPLACE_ME
  'APP_SECRET=[^R][^E][^P]'                          # any APP_SECRET= that is not REPLACE_ME
  'API_KEY=[^R][^E][^P ]'                            # any API_KEY= that is not REPLACE_ME / empty
  'BOT_TOKEN=[0-9]{6,}:'                             # Telegram bot token
  '0x[0-9a-fA-F]{64}'                                # a 32-byte hex secret (private key)
  '302e020100300506032b657004220420[0-9a-f]{64}'     # Hedera ED25519 DER private key
  '3030020100300706052b8104000a04220420[0-9a-f]{64}' # Hedera ECDSA DER private key
  'MIGHAgEAMBMGByqGSM49'                             # P-256 PKCS8 private key, base64
  'postgres://[^:]+:[^@]{4,}@'                       # database URL with a password
)

hits=0
for pattern in "${patterns[@]}"; do
  # -S would only find additions/removals of the exact string; -G greps the diff text.
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    hits=$((hits + 1))
    echo "$line"
  done < <(git log --all -p -G"$pattern" --format='%h %s' -- . ':(exclude)bun.lock' \
    | grep -E "^[0-9a-f]{7} |^\+.*($pattern)" \
    | grep -B1 -E "^\+" \
    | grep -vE 'REPLACE_ME|0xREPLACE|example\.com|0x0{40}|0x000000000000000000000000000000000000dEaD|\$\{|=\.\.\.|postgres:postgres@' \
    | grep -E "^\+" \
    | head -20 \
    | while IFS= read -r hit; do printf '[%s] %s\n' "$pattern" "$hit"; done)
done

if [ "$hits" -gt 0 ]; then
  echo
  echo "$hits line(s) matched a credential shape. Explain or purge each before flipping the repository public."
  exit 1
fi
echo "No credential shapes found in any commit on any branch."
