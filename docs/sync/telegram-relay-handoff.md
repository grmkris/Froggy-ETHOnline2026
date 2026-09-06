# Telegram relay for the Froggy team grilling session

Configured 6 September 2026. This replaces the earlier instructions to poll Hermes `state.db` or mention the bot. The hackathons group now has its own inbox; Hermes does not run on its incoming messages.

## Connection and commands

- SSH: `kristjan@37.60.232.68`, local key `/home/kristjan/.ssh/id_ed25519`.
- Bot: `@kermes96bot`; group: `hackathons`; chat ID: `-5307060028`.
- Remote Python: `/home/kristjan/.hermes/hermes-agent/venv/bin/python`.
- Remote helper: `/home/kristjan/.hermes/scripts/froggy_tg_relay.py`.
- Private inbox: `/home/kristjan/.hermes/telegram-relay/hackathons.sqlite3`.

Check status:

```sh
ssh -i /home/kristjan/.ssh/id_ed25519 -o BatchMode=yes kristjan@37.60.232.68 '/home/kristjan/.hermes/hermes-agent/venv/bin/python /home/kristjan/.hermes/scripts/froggy_tg_relay.py status'
```

Send a question from a local UTF-8 text file (the helper reads stdin and returns the Telegram message ID):

```sh
ssh -i /home/kristjan/.ssh/id_ed25519 -o BatchMode=yes kristjan@37.60.232.68 '/home/kristjan/.hermes/hermes-agent/venv/bin/python /home/kristjan/.hermes/scripts/froggy_tg_relay.py send' < /tmp/froggy-question.txt
```

Read replies, replacing `0` with the saved cursor:

```sh
ssh -i /home/kristjan/.ssh/id_ed25519 -o BatchMode=yes kristjan@37.60.232.68 '/home/kristjan/.hermes/hermes-agent/venv/bin/python /home/kristjan/.hermes/scripts/froggy_tg_relay.py poll --after 0 --limit 100'
```

The JSON contains `events` and `next_cursor`. Each event includes sender identity, text, Telegram message ID, reply-to message ID, edit timestamp and a unique inbox ID. Keep a durable cursor and map sent message IDs to question IDs. Drain full batches before waiting 20 seconds. Establish the session's starting cursor once; do not reset it to the latest value on reconnect and skip unread answers.

## Collecting answers from the whole team

- Ordinary text, replies, mentions and commands are captured without starting Hermes. Nobody needs to mention the bot. Attachments are currently recorded as metadata/available caption, not downloaded or transcribed; request a text answer when needed.
- Keep one current answer per person per question, with revision history. Edits replace that person's earlier position; they do not count as additional votes. Use reply-to IDs and explicit question IDs, and clarify ambiguous attribution.
- Wait for the participants agreed for the round, or an explicitly agreed deadline/decision to move on. One person's answer does not close the question. Silence is not agreement.
- Summarize common ground, distinct options, objections and missing answers. For genuinely comparable numeric estimates, show count, mean, median and range; normalize units and distinguish estimates from commitments. Do not average categorical preferences or erase a minority objection.
- Return the proposed synthesis to the team for confirmation. Preserve individual ownership commitments and get explicit agreement on scope and consequential tradeoffs.
- Only Claude/Fable performs the grilling and synthesis. The relay does not invoke a model, decide outcomes or implement anything.

## Operations and verification

The existing Hermes gateway remains the only Telegram update consumer. A local `gateway:startup` hook installs an early Telegram handler for this group, and a `pre_gateway_dispatch` plugin guards startup dispatch. Other chats retain their normal behavior. Sending uses the existing bot through the helper; it requires no token copying or new bot.

Installation paths on the VPS:

- `~/.hermes/hooks/froggy-telegram-relay/`
- `~/.hermes/plugins/froggy-telegram-relay/`
- `~/.hermes/scripts/froggy_tg_relay.py`
- `plugins.enabled` in `~/.hermes/config.yaml` includes `froggy-telegram-relay`.

The Hermes checkout was not modified. Pre-change backup: `~/hermes-backups/froggy-relay-20260906T134057Z/`. To remove this behavior deliberately, remove the relay startup hook and plugin activation, then restart the gateway; preserve the inbox/history. Do not disable it as part of ordinary session polling.

Checks passed against the actual Telegram Application dispatcher and temporary SQLite storage: two senders answering one question, replies, mentions, commands, edits, duplicate delivery, unaffected DMs/other groups and no dispatch after a storage failure. The restarted service reported active, with the relay ready marker matching its process ID. This is not a claim that Claude's separate planning session has already switched to the new inbox.
