# Engines behind llama-swap

MAGI gets the most out of a local model when it is served by [llama-swap](https://github.com/mostlygeek/llama-swap): MECHA units, loading with the angel attack, GPU telemetry and `/magi status` all come from llama-swap's own endpoints. llama-swap is not tied to llama.cpp: any OpenAI-compatible engine can sit behind it, including single-model engines such as halogen, gufo or ds4. This guide shows how, using a real setup: **strix-swap**, a llama-swap on an AMD Strix Halo (Ryzen AI Max+ 395, 128 GB) where every engine runs in podman.

```
pi + MAGI ──► llama-swap :9292 ──► podman: halogen      (Qwen3.8 Flash Next)
 (magi.json     /v1/*, /running,   podman: gufo         (Qwen3.8 27B / Flash Next, GGUF)
  "swaps")      /metrics,          podman: ds4          (DeepSeek V4 Flash)
                /upstream/<model>  ...one at a time, started on demand
```

## What MAGI gets from each engine

llama-swap answers some endpoints itself and forwards others to the engine. Only the forwarded ones depend on the engine:

| Feature | Comes from | Works with any engine? |
| --- | --- | --- |
| Model list, context, output cap, thinking levels, image input | llama-swap `/v1/models` (from the config) | yes |
| MECHA SELECT: in VRAM / asleep | llama-swap `/running` | yes |
| Load on pick + angel attack | `GET /upstream/<model>/health` | only if the engine answers `/health` with 200 |
| VRAM, GPU, RAM, energy, cost | llama-swap `/metrics` | yes |
| tok/s, prompt tok/s of the last request | llama-swap `/api/metrics/activity` | yes |
| Live context in the seven seals | `/upstream/<model>/slots` | llama.cpp only; otherwise pi's estimate |
| Prefix prewarm | `/upstream/<model>/apply-template` | llama.cpp only; skipped otherwise |

So an engine needs two things to feel native in MAGI: an OpenAI `/v1/chat/completions`, and a `/health` that answers 200 once the model is loaded.

## The server

One llama-swap binary, one `config.yaml`, a systemd user unit:

```ini
# ~/.config/systemd/user/strix-swap.service
[Service]
EnvironmentFile=%h/strix-swap/env          # STRIX_SWAP_KEY=sk-..., chmod 600
ExecStart=%h/strix-swap/llama-swap --config %h/strix-swap/config.yaml --listen 0.0.0.0:9292 --watch-config
Restart=on-failure
```

`--watch-config` reloads the config on save: edit, save, and the next request uses it. Enable lingering (`loginctl enable-linger`) so the unit runs without a login.

The top of the config:

```yaml
includeAliasesInList: true     # Instruct twins show up in /v1/models (and in MECHA SELECT)
healthCheckTimeout: 300        # seconds to wait for an engine to load
startPort: 10001               # ${PORT} handed to each engine
sendLoadingState: true
apiKeys:
  - "${env.STRIX_SWAP_KEY}"    # from the unit's EnvironmentFile

macros:
  podman_gpu: >-
    --network=host --device /dev/kfd --device /dev/dri --group-add keep-groups
    --ulimit memlock=-1:-1
```

With no `groups`, llama-swap keeps one model loaded at a time: picking another one stops the current engine first. That is what you want when every engine takes most of the memory.

## Anatomy of an entry

The halogen entry, field by field:

```yaml
models:
  "Qwen3.8 Flash Next - Halogen 4bit - Thinking":     # the id clients send; MAGI shows it as is
    macros:
      ctx_size: 140000
    capabilities:                                      # what llama-swap publishes in /v1/models
      in: [text, image]                                #   image input in MAGI
      tools: true
      context: ${ctx_size}                             #   pi's context window
    metadata:
      output_length: 65536                             #   pi's output cap (MAGI caps it at 32K)
      reasoning:
        format: qwen3.8
        levels: [low, medium, high, xhigh, max]        #   the levels /thinking offers
    filters:
      setParamsByID:                                   # sampling and thinking, see below
        "${MODEL_ID}":
          temperature: 1.0
          top_k: 20
          top_p: 0.95
          presence_penalty: 0.0
        "Qwen3.8 Flash Next - Halogen 4bit - Instruct":
          temperature: 0.7
          top_k: 20
          top_p: 0.8
          presence_penalty: 1.5
          chat_template_kwargs:
            enable_thinking: false
    cmd: |                                             # foreground process; llama-swap stops it on swap
      podman run --rm --replace --name halogen ${podman_gpu} --ipc=host
      -e HALOGEN_API_PORT=${PORT} -e HALOGEN_CTX=${ctx_size}
      -v /home/engineering/halogen-models:/models:ro
      ghcr.io/peonist-ai/halogen-flash-server:0.18.1
    cmdStop: podman stop -t 30 halogen                 # a clean stop frees the GPU memory
    checkEndpoint: /health                             # ready when this answers 200
```

The rules that matter:

- **`cmd` runs in the foreground.** `podman run` without `-d`; `--rm --replace` so a crashed container never blocks the next start.
- **The engine listens on `${PORT}`, on localhost.** With `--network=host`, pass `${PORT}` through the engine's own flag or variable. Only llama-swap's port is reachable from the LAN.
- **`cmdStop` names the container.** Without it llama-swap kills the podman client and the container can outlive it, holding the memory.
- **`checkEndpoint`** is the engine's health route; for an engine without one, use `/v1/models`.
- **Pin image tags** (`:0.18.1`, not `:latest`) so an upgrade is a config change you can see and revert.

## Thinking and Instruct from one process

`setParamsByID` turns one loaded model into two ids. The key `"${MODEL_ID}"` holds the Thinking defaults; a second key creates the Instruct id, served by the same process with thinking forced off through `chat_template_kwargs`. Switching between them in pi never reloads the model.

The filters also set sampling. Do it here rather than in pi: some engines decode greedily when the client sends no temperature (halogen does), and every client then gets the model's recommended values. Leave sampling out when the engine's defaults already match the model card (gufo, ds4).

MAGI gives thinking levels only to the main id: the Instruct id is published as an alias and stays off.

## Engine recipes

All of these run on the Strix Halo (gfx1151).

| Engine | Model | Image | Port | Health | Notes |
| --- | --- | --- | --- | --- | --- |
| [halogen](https://github.com/peonist-ai/halogen-flash-server) | Qwen3.8 Flash Next (`.hgn`) | `ghcr.io/peonist-ai/halogen-flash-server` | `-e HALOGEN_API_PORT=${PORT}` | `/health` | greedy without a client temperature: set sampling in the filters |
| gufo | Qwen3.8 27B / Flash Next (GGUF) | `ghcr.io/gufo-org/toolboxes/gufo-runtime` | `--port ${PORT}` | `/health` | refuses any other model name: `useModelName` |
| [ds4](https://github.com/antirez/ds4) | DeepSeek V4 Flash (antirez GGUF) | `docker.io/kyuz0/strix-halo-ds4-toolbox` | `--port ${PORT}` | none: `checkEndpoint: /v1/models` | MAGI's load check needs `/health` (see Pitfalls) |

**gufo** checks the `model` field of every request, so llama-swap rewrites it:

```yaml
    cmd: |
      podman run --rm --replace --name gufo-flash ${podman_gpu} --userns=keep-id:uid=1000,gid=1000
      -v /home/engineering/models:/models:ro ghcr.io/gufo-org/toolboxes/gufo-runtime:latest
      gufo serve --host 127.0.0.1 --port ${PORT} --sessions 4 llm
      --model /models/qwen3.8-flash-next/UD-Q4_K_XL/Qwen3.8-Flash-Next-UD-Q4_K_XL-00001-of-00004.gguf
      --context ${ctx_size}
    cmdStop: podman stop -t 30 gufo-flash
    useModelName: "Qwen3.8 Flash Next"
```

**ds4** takes `chat_template_kwargs.enable_thinking` like the others, and maps `reasoning_effort` `low`/`medium`/`high`/`max` to DeepSeek's levels:

```yaml
  "DeepSeek V4 Flash - ds4 Q2 - Thinking":
    macros:
      ctx_size: 124000
    capabilities:
      in: [text]
      tools: true
      context: ${ctx_size}
    metadata:
      output_length: 65536
      reasoning:
        format: deepseek
        levels: [low, medium, high, max]
    filters:
      setParamsByID:
        "DeepSeek V4 Flash - ds4 Q2 - Instruct":
          chat_template_kwargs:
            enable_thinking: false
    cmd: |
      podman run --rm --replace --name ds4 ${podman_gpu} --ipc=host --security-opt seccomp=unconfined
      -v /home/engineering/models/deepseek-v4-flash:/models:ro
      docker.io/kyuz0/strix-halo-ds4-toolbox:rocm-10.0_20261010T230654
      ds4-server --host 127.0.0.1 --port ${PORT} --ctx ${ctx_size}
      -m /models/DeepSeek-V4-Flash-IQ2XXS-w2Q2K-AProjQ8-SExpQ8-OutQ8-chat-v2-imatrix-0731.gguf
    cmdStop: podman stop -t 30 ds4
    checkEndpoint: /v1/models
    useModelName: "deepseek-v4-flash"
```

## Adding an engine

1. Run it once by hand in its container, on a fixed port, and check `/v1/models` and one chat request with `curl`.
2. Find its port flag, its health route and whether it checks the model name (`useModelName`).
3. Read its sampling defaults; set the model card's values in `filters` only if they differ.
4. Write the entry: `cmd` in the foreground on `${PORT}`, `cmdStop` with the container name, `checkEndpoint`, `capabilities`, `metadata.reasoning.levels` in the names the engine accepts.
5. Save. `--watch-config` reloads, and `/v1/models` shows the new id.
6. In pi, restart: MAGI reads the list at startup. Pick the model in MECHA SELECT and watch it load.

## Using it from pi

List the server in `~/.pi/agent/magi.json` and enable its models in `settings.json`:

```json
"swaps": { "strix-swap": { "url": "http://192.168.2.193:9292", "apiKey": "sk-..." } }
```

```json
"enabledModels": ["strix-swap/*"]
```

Register each server once. The pi-llama-swap plugin is a second way to register a llama-swap server: if it points at the same server as a `swaps` entry, every model shows up twice in MECHA SELECT.

Any other OpenAI client works the same way:

```
curl http://192.168.2.193:9292/v1/chat/completions \
  -H "Authorization: Bearer $STRIX_SWAP_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"Qwen3.8 Flash Next - Halogen 4bit - Instruct","messages":[{"role":"user","content":"ciao"}]}'
```

## Pitfalls

- **An engine without `/health` shows an error in MAGI.** MAGI loads the model with `GET /upstream/<model>/health` and expects 200; ds4 answers 404 there even when it is loaded. llama-swap itself is fine (`checkEndpoint: /v1/models`), and requests work.
- **Memory.** One model at a time is not only a default here: two engines side by side can stall the host for minutes. Leave room for the context: a model file of 81 GiB on 128 GB leaves about 40 GB for KV cache and the OS.
- **Container left behind.** If a start fails with "name already in use", a container outlived its llama-swap process: `podman ps`, `podman stop <name>`. `--replace` in `cmd` avoids it.
- **Never `pkill -f` over ssh** with a pattern that also appears in the ssh command line: it kills your own shell. Stop containers by name.
- **First request after a pull is slow.** llama-swap starts the engine, podman pulls the image, and `healthCheckTimeout` keeps counting. Pull large images by hand, or raise the timeout.
- **GPU telemetry on AMD.** llama-swap reads GPU stats from `rocm-smi`; put it on the unit's `PATH` (strix-swap uses TheRock's) or the GPU rows stay empty.
