# pi-magi-theme

A three-mind council theme + extension for [pi](https://pi.dev): a MAGI SYSTEM header, the three MAGI as their control screen in a fixed side panel, live llama-swap telemetry, and `/magi`, a council of three models that votes on your engineering questions and reviews your pending changes.

Fan-art theme inspired by Neon Genesis Evangelion: the MAGI and their screen belong to their creators, all rights reserved to khara, Inc. This project is not affiliated with them. The rest of the symbolism (the Tree of Life, the sephirot, the seven seals) is public domain.

![pi with the MAGI theme: MAGI SYSTEM header, MECHA SELECT model picker, side panel with the MAGI screen and llama-swap telemetry](https://raw.githubusercontent.com/b-iurea/pi-magi-theme/main/docs/screenshot.png)

![The angel attack: red spreads through the MAGI while the model loads into VRAM](https://raw.githubusercontent.com/b-iurea/pi-magi-theme/main/docs/angel-attack.png)

## Install

```bash
pi install npm:pi-magi-theme
```

Then in `~/.pi/agent/settings.json`:

```json
"theme": "magi",
"tuiMode": "fullscreen"
```

`tuiMode: fullscreen` keeps the side panel fixed while the chat scrolls.

### From source

Clone the repo and point pi at it instead (edits in the repo are live on the next pi start):

```json
"extensions": ["/path/to/pi-magi-theme/extensions/magi"],
"themes": ["/path/to/pi-magi-theme/themes"]
```

## Commands

| Command | What it does |
|---------|--------------|
| `/magi <question>` | the council answers a question (recent conversation as context) |
| `/magi review [focus]` | the council reviews your pending changes (`git diff HEAD` plus untracked file names) before you commit |
| `/magi config` | pick a model for each MAGI |
| `/magi mecha` | MECHA SELECT: pick the llama-swap model to activate, each shown as a mecha head lit by its real state |
| `/magi-ui compact` | toggle the compact side panel (basic info and animations only); remembered across sessions |
| `/magi-ui status` | llama-swap report from its last 100 requests: speed, tokens, cache hits, MTP draft acceptance, durations, errors per model |
| `/magi-ui config` | set the electricity price per kWh and the currency (EUR or USD) for the COST row |
| `/magi-ui panel` · `on` · `off` | hide/show the side panel, enable/disable the whole chrome |
| `/magi-ui hygiene` · `on` · `off` · `<turns> <results>` | show how much context the hygiene pruned; enable/disable it; how many recent turns keep their thinking and how many tool results stay whole (e.g. `3 5`) |
| `/magi-ui budget` · `auto` · `off` · `reset` · `<planning> <acting>` | show the thinking budget of the current model; learn it per model (default); leave it to llama-server; forget what was learned for this model; or fix it (e.g. `16k 4k`) |

## Lore ↔ function

Every symbol stands for something real the agent is doing.

| Symbol | Meaning | Function | Where |
|--------|---------|----------|-------|
| Tree of Life, upper triad (Keter, Chokmah, Binah) | will, wisdom, understanding | the model is **thinking** | footer |
| light descending Tiferet → Malkuth | manifestation | the model is **streaming the answer** (with live tok/s) | footer |
| light ascending Malkuth → Keter | ascent | the model is **being loaded into VRAM** | footer |
| Malkuth at rest | the kingdom | **idle**, with the last run duration | footer |
| MELCHIOR · BALTHASAR · CASPAR flickering | the three Magi at work | what the agent **is doing** (thinking, responding, compacting); below them, the **last real `/magi` verdict** | panel |
| red spreading through BALTHASAR, MELCHIOR, CASPAR | an angel hacking the MAGI | the model is **being loaded into VRAM**, at the pace of its last load; CASPAR's last corner blinks once everything else has fallen | panel |
| blue taking the MAGI back from that corner | the attack repelled | the model is **loaded** | panel |
| MECHA-I · II · III · LEGION | units waiting for a pilot | the **llama-swap models**: dormant, waking while loading, eyes lit in VRAM | MECHA SELECT |
| the session's unit, in sync | the unit acts under its pilot | a **tool is running**, with the file or command it works on | panel + footer |
| the unit going berserk | the leash breaks: red eyes, jaw wide open | a **tool failed** | panel + footer |
| SYNC | the unit's sync ratio | **tool success rate** | panel + footer |
| CHESED ✓ / GEBURAH ✗ | mercy / severity | **successful / failed tools** | panel + footer |
| the seven seals | the end of an age | **context window usage**, one seal per seventh | panel |
| the sixth seal blinking | the last warning | context **close to compaction**: compact now instead of mid-task | panel + footer |
| breaking the seals → seventh seal opened | apocalypse and renewal | **context compaction** running → done | panel + footer |
| Malkuth asleep | the kingdom sleeps | llama-swap **unloaded the model**; typing wakes it | panel + footer |

The window title is `π - Magi - <working directory>`. After a run longer than 30 seconds it becomes `✓ π - Magi - …` until you touch the keyboard, so you notice from another window that the agent finished.

In fullscreen mode the side panel always reaches the bottom of the terminal.

In a terminal too narrow for it, the footer scrolls as one line instead of being cut off.

## The seventh seal: smart compaction

The theme does not compact anything itself: it shows who does. For better compaction install [pi-smart-compact](https://www.npmjs.com/package/pi-smart-compact):

```bash
pi install npm:pi-smart-compact
```

It extracts files, errors, decisions and open loops locally (no LLM calls), then synthesizes and verifies the summary. Point its `summaryModel` at a local model to keep compaction free. When it is installed, the sixth seal suggests `/smart-compact`, the seals name it while they break (`✶ BREAKING THE SEALS · smart-compact · 4s`) and the seventh seal reports who actually produced the summary: `smart-compact`, or `pi native` if it fell back to pi's own compactor.

## Local models: context hygiene, loop guard, MAGI.md

Local models run out of context on long tasks well before they run out of work. MAGI keeps them going:

- **Context hygiene.** Before every request, old thinking blocks, old tool outputs and old `write`/`edit` payloads are replaced by a one-line `<<pruned by MAGI…>>` marker in what the model sees; the saved session stays whole. The newest 3 turns keep their thinking and the newest 5 tool results stay whole. Pruning advances in steps of ~15k tokens behind a watermark, so between steps the prompt only grows at the end and llama.cpp keeps reusing its KV cache. Replayed on two real 104k/119k-token sessions it keeps them at ~64k/~47k. Old tool outputs are masked instead of summarized: [simple observation masking matches LLM summarization at half the cost](https://arxiv.org/abs/2508.21433).
- **Loop guard.** The same tool call with the same arguments three times in a row is blocked with a message asking the model to change approach; a `write`/`edit` that copies a pruned marker into a file is blocked too.
- **MAGI.md.** Created in the project on the first start (never overwritten) and appended to the system prompt on every run: short rules against the usual local-model failures (overthinking, reading whole files, invented paths, unverified success, blind retries), and a PLAN.md/NOTES.md habit so the task state survives pruning and compaction. Edit it per project; delete it to get the defaults back.

- **Thinking budget.** A runaway think inside a single turn is stopped by llama.cpp's thinking budget, set by MAGI on every request, separately for planning (right after you write) and acting (between tool calls, where long thinking is mostly overthinking). It learns itself per model: 1.5 × the 95th percentile of the model's last 30 thinking lengths in that phase, a cut counting as the budget it hit. While at most 5% of replies are cut (the runaway ones) the budget holds; above that it grows 1.5× until cuts fall back under 5%; a model that thinks little pulls it down (limits: planning 4k–32k, acting 2k–32k). Until a model has 10 replies in a phase it starts from 16k / 4k. When the budget runs out llama.cpp does not abort the reply: it forces a closing sentence and the end-of-thinking tag, and the model goes on to act. That sentence tells it what to do (a small verifiable step, the open plan into PLAN.md), MAGI.md tells it the same, and the cut thinking stays in context for the next turn, which gets a fresh budget. The side panel counts the cuts (`HYGIENE -18.2k ✂2`); frequent cuts mean the budget is too low for that model.

  llama.cpp honours a per-request budget only when llama-server runs **without** `--reasoning-budget`, and the closing sentence can only be set on the server. Add to each thinking model's `cmd` in llama-swap:

  ```
  --reasoning-budget-message "Time is up. I will take the smallest safe next step with what I know, and write my open plan into PLAN.md."
  ```

  Keep the sentence exactly as written: MAGI recognizes a cut by it.

## The council

`/magi <question>` asks three models in parallel, each with its own nature, then shows the votes and a majority verdict:

| Unit | Nature | Looks at |
|------|--------|----------|
| MELCHIOR | PRAGMATIST | what solves the problem, the simplest path, effort vs value, what already exists (in software: reuse, YAGNI, shipping) |
| BALTHASAR | GUARDIAN | what can go wrong and for whom, reversibility, hidden costs (in software: failure modes, security, operability) |
| CASPAR | VISIONARY | whether the question is framed right, alternatives, people's experience, long-term direction (in software: design, DX, evolution) |

Each nature is a lens, not a specialty, so the council answers any question, not only software ones. Every MAGI first answers the question, then judges it through its lens, naming concrete tools, numbers and scenarios from your question instead of generic advice. Votes: **APPROVE** = go ahead or clear recommendation; **CONDITIONAL** = only if the named conditions hold, or when information is missing (it says what it needs); **REJECT** = a concrete problem, with what to do instead. A MAGI never rejects because a topic is outside its nature. Answers come back in the language of your question.

`/magi <question>` gives the MAGI the recent conversation as context; `/magi review` gives them the pending diff (truncated at 24k characters). Full opinions are added to the chat (not sent to the agent), and the last verdict stays under the MAGI in the side panel.

## Configuration

`~/.pi/agent/magi.json` (written by `/magi config`, `/magi-ui compact` and `/magi-ui config`, editable by hand):

```json
{
  "MELCHIOR": { "model": "llama-swap/Qwen3.8 27B Q4_K_M - Thinking", "thinking": "low" },
  "ui": { "compact": false, "kwhPrice": 0.30, "currency": "EUR" },
  "loads": { "qwen3.8-27b": 41200 },
  "totalWh": 1843.2,
  "hygiene": { "enabled": true, "keepThinkingTurns": 3, "keepToolResults": 5, "stepTokens": 15000, "minPruneChars": 600 },
  "thinkingBudget": { "mode": "auto", "planning": 16384, "acting": 4096, "learned": { "qwen3.8-27b": { "acting": [812, 430, 2211] } } }
}
```

- per MAGI: `model` (unset = current session model) and optional `thinking` level;
- `ui.compact`: start with the compact side panel;
- `ui.kwhPrice` and `ui.currency` (`EUR` or `USD`): the COST row multiplies the GPU energy by this price, showing the running total of every session with the current one in brackets;
- `totalWh`: written by the theme, GPU energy summed over every session (delete the key to reset the COST total);
- `hygiene` and `thinkingBudget` are set with `/magi-ui hygiene` and `/magi-ui budget`; `thinkingBudget.learned` is written by the theme (recent thinking lengths per model and phase);
- `loads`: written by the theme, how long each llama-swap model took to load last time (paces the angel attack; 60s when unknown).

## Release

`.github/workflows/publish.yml` publishes to npm when a `v*` tag is pushed, and refuses if the tag does not match `package.json`:

```
npm version patch && git push --follow-tags
```

No token: npmjs is configured to trust this repository's `publish.yml` (npm trusted publishing, OIDC), which also signs the provenance.

## llama-swap

When the session model uses the `llama-swap` provider, the side panel:

- loads nothing at startup: a new session opens MECHA SELECT, a resumed one shows whether its model is already in VRAM;
- loads the model into VRAM when you pick it, change it with `/model` or type (`GET /upstream/<model>/health`), with the angel attack animation;
- prewarms a new session: pi's real system prompt and tools are processed as soon as the model is ready, so the first answer doesn't wait for them;
- follows the context live in the seven seals while the model works (`/upstream/<model>/slots`);
- notices when llama-swap unloads the model (`/running`), shows it asleep and reloads it as soon as you type;
- shows VRAM, GPU load/temperature/power, RAM and the GPU energy used in the session from `/metrics` (every 3s while working, every 30s when idle);
- shows server-measured tok/s, prompt tok/s and KV cache hits of the last request (`/api/metrics/activity?limit=1`).
