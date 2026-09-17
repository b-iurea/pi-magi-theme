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

## The seventh seal: smart compaction

The theme does not compact anything itself: it shows who does. For better compaction install [pi-smart-compact](https://www.npmjs.com/package/pi-smart-compact):

```bash
pi install npm:pi-smart-compact
```

It extracts files, errors, decisions and open loops locally (no LLM calls), then synthesizes and verifies the summary. Point its `summaryModel` at a local model to keep compaction free. When it is installed, the sixth seal suggests `/smart-compact`, the seals name it while they break (`✶ BREAKING THE SEALS · smart-compact · 4s`) and the seventh seal reports who actually produced the summary: `smart-compact`, or `pi native` if it fell back to pi's own compactor.

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
  "loads": { "qwen3.8-27b": 41200 }
}
```

- per MAGI: `model` (unset = current session model) and optional `thinking` level;
- `ui.compact`: start with the compact side panel;
- `ui.kwhPrice` and `ui.currency` (`EUR` or `USD`): the COST row multiplies the GPU energy used in the session by this price;
- `loads`: written by the theme, how long each llama-swap model took to load last time (paces the angel attack; 60s when unknown).

## llama-swap

When the session model uses the `llama-swap` provider, the side panel:

- loads nothing at startup: a new session opens MECHA SELECT, a resumed one shows whether its model is already in VRAM;
- loads the model into VRAM when you pick it, change it with `/model` or type (`GET /upstream/<model>/health`), with the angel attack animation;
- prewarms a new session: pi's real system prompt and tools are processed as soon as the model is ready, so the first answer doesn't wait for them;
- follows the context live in the seven seals while the model works (`/upstream/<model>/slots`);
- notices when llama-swap unloads the model (`/running`), shows it asleep and reloads it as soon as you type;
- shows VRAM, GPU load/temperature/power, RAM and the GPU energy used in the session from `/metrics` (every 3s while working, every 30s when idle);
- shows server-measured tok/s, prompt tok/s and KV cache hits of the last request (`/api/metrics/activity?limit=1`).
