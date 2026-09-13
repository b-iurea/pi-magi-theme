# pi-magi-theme

A three-mind council theme + extension for [pi](https://pi.dev): a detailed Tree of Life in the header, the three MAGI in a fixed side panel, live llama-swap telemetry, and `/magi`, a council of three models that votes on your engineering questions and reviews your pending changes.

All artwork is original. The symbolism (the three Magi, the Tree of Life, the golem, the seven seals) is public domain.

![pi with the MAGI theme: Tree of Life header, side panel with the MAGI triangle and llama-swap telemetry](https://raw.githubusercontent.com/b-iurea/pi-magi-theme/main/docs/screenshot.png)

![The MAGI deliberating while the model thinks](https://raw.githubusercontent.com/b-iurea/pi-magi-theme/main/docs/deliberation.png)

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
| `/magi-ui compact` | toggle the compact side panel (basic info and animations only); remembered across sessions |
| `/magi-ui status` | llama-swap report from its last 100 requests: speed, tokens, cache hits, MTP draft acceptance, durations, errors per model |
| `/magi-ui panel` · `on` · `off` | hide/show the side panel, enable/disable the whole chrome |

## Lore ↔ function

Every symbol stands for something real the agent is doing.

| Symbol | Meaning | Function | Where |
|--------|---------|----------|-------|
| Tree of Life, upper triad (Keter, Chokmah, Binah) | will, wisdom, understanding | the model is **thinking** | footer |
| light descending Tiferet → Malkuth | manifestation | the model is **streaming the answer** (with live tok/s) | footer |
| light ascending Malkuth → Keter | ascent | the model is **being loaded into VRAM** | footer |
| Malkuth at rest | the kingdom | **idle**, with the last run duration | footer |
| MELCHIOR · BALTHASAR · CASPAR flickering | the three Magi at work | what the agent **is doing** (thinking, responding, loading, compacting); below them, the **last real `/magi` verdict** | panel |
| the golem, EMET ("truth") | a clay servant that acts | a **tool is running**, with the file or command it works on | panel + footer |
| the golem, MET ("death") | the aleph is erased | a **tool failed** | panel + footer |
| SYNC | the golem's obedience | **tool success rate** | panel + footer |
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

`~/.pi/agent/magi.json` (written by `/magi config` and `/magi-ui compact`, editable by hand):

```json
{
  "MELCHIOR": { "model": "llama-swap/Qwen3.8 27B Q4_K_M - Thinking", "thinking": "low" },
  "ui": { "compact": false, "kwhPrice": 0.30 }
}
```

- per MAGI: `model` (unset = current session model) and optional `thinking` level;
- `ui.compact`: start with the compact side panel;
- `ui.kwhPrice`: price per kWh, to show the cost next to the energy used by the GPUs.

## llama-swap

When the session model uses the `llama-swap` provider, the side panel:

- loads the model into VRAM on startup and on model change (`GET /upstream/<model>/health`), with a MAGI boot animation;
- notices when llama-swap unloads the model (`/running`), shows it asleep and reloads it as soon as you type;
- shows VRAM, GPU load/temperature/power, RAM and the GPU energy used in the session from `/metrics` (every 3s while working, every 30s when idle);
- shows server-measured tok/s, prompt tok/s and KV cache hits of the last request (`/api/metrics/activity?limit=1`).
