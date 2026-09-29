/**
 * Local-model helpers for MAGI: context hygiene, loop guard, and the MAGI.md rules template.
 *
 * Context hygiene rewrites the messages pi sends to the model (never the saved session):
 *  - old thinking blocks are dropped: Qwen templates resend every reasoning block of an agent run,
 *    one 18k-token think stays in the context until compaction
 *  - old tool outputs become a one-line marker (observation masking, Lindenbauer et al. 2025:
 *    as good as LLM summarization, at half the cost)
 *  - old write/edit payloads become a marker too: the file on disk is the source of truth
 * Pruning advances in steps behind a watermark, so between steps the prompt only grows at the end
 * and llama.cpp keeps reusing its KV cache.
 */

export type Msg = { role: string; content?: any; [key: string]: any };

export interface HygieneOptions {
	keepThinkingTurns: number; // newest assistant messages that keep their thinking
	keepToolResults: number; // newest tool results kept whole
	stepTokens: number; // the watermark moves each time the prunable total crosses another multiple of this
	minPruneChars: number; // smaller outputs/payloads are left alone
}

export interface HygieneStats {
	messages: number;
	watermark: number; // messages before this index are pruned
	prunedTokens: number;
	pendingTokens: number; // prunable, waiting for the next step
	stepTokens: number;
}

export const HYGIENE_DEFAULTS: HygieneOptions = { keepThinkingTurns: 3, keepToolResults: 5, stepTokens: 15_000, minPruneChars: 600 };

// ponytail: chars/token measured on Qwen3.x pi sessions (2.9–3.2); a tokenizer call would be exact but costs a request
const CHARS_PER_TOKEN = 3;
const IMAGE_CHARS = 4800;

/** Marks every placeholder, so a model that copies one into a real write/edit gets blocked (see loop guard). */
export const PRUNED_MARK = "<<pruned by MAGI";

const lines = (s: string) => s.split("\n").length;
const clip = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function callTarget(call: any): string {
	const a = call?.arguments ?? {};
	return clip(String(a.path ?? a.command ?? a.pattern ?? a.query ?? a.url ?? ""));
}

function resultChars(m: Msg): number {
	let n = 0;
	for (const c of m.content ?? []) n += c.type === "image" ? IMAGE_CHARS : (c.text?.length ?? 0);
	return n;
}

function editChars(call: any): number {
	return (call.arguments?.edits ?? []).reduce((n: number, e: any) => n + (e.oldText?.length ?? 0) + (e.newText?.length ?? 0), 0);
}

/** Chars pruning would remove from this assistant message. */
function assistantSavings(m: Msg, o: HygieneOptions): number {
	let n = 0;
	for (const c of m.content ?? []) {
		if (c.type === "thinking") n += c.thinking?.length ?? 0;
		else if (c.type === "toolCall" && c.name === "write" && (c.arguments?.content?.length ?? 0) >= o.minPruneChars) n += c.arguments.content.length;
		else if (c.type === "toolCall" && c.name === "edit" && editChars(c) >= o.minPruneChars) n += editChars(c);
	}
	return n;
}

function pruneAssistant(m: Msg, o: HygieneOptions): Msg {
	const content = [];
	for (const c of m.content ?? []) {
		if (c.type === "thinking") continue;
		if (c.type === "toolCall" && c.name === "write" && (c.arguments?.content?.length ?? 0) >= o.minPruneChars) {
			const text = c.arguments.content as string;
			content.push({ ...c, arguments: { ...c.arguments, content: `${PRUNED_MARK}: ${lines(text)} lines written, the file on disk is the source of truth>>` } });
		} else if (c.type === "toolCall" && c.name === "edit" && editChars(c) >= o.minPruneChars) {
			const edits = c.arguments.edits.map((e: any) => ({ oldText: `${PRUNED_MARK}>>`, newText: `${PRUNED_MARK}: ${lines(e.newText ?? "")} lines>>` }));
			content.push({ ...c, arguments: { ...c.arguments, edits } });
		} else content.push(c);
	}
	// a message that only held thinking keeps a marker: some templates choke on an empty assistant turn
	if (!content.length) content.push({ type: "text", text: `${PRUNED_MARK}: reasoning>>` });
	return { ...m, content };
}

function pruneResult(m: Msg, call: any): Msg {
	const text = (m.content ?? []).map((c: any) => c.text ?? "").join("\n");
	const what = [m.toolName, callTarget(call)].filter(Boolean).join(" ");
	return { ...m, content: [{ type: "text", text: `${PRUNED_MARK}: output of ${what}, ${lines(text)} lines. Run it again if you need it.>>` }] };
}

/**
 * Prunes everything before the watermark. The watermark sits on the last point where the prunable chars,
 * summed from the first message, crossed a multiple of stepTokens. Only messages before the protected tail
 * count, and the tail only moves forward, so earlier crossings never move: the pruned prefix is stable.
 */
export function pruneContext(messages: Msg[], o: HygieneOptions = HYGIENE_DEFAULTS): { messages: Msg[]; stats: HygieneStats } {
	const lastIndices = (role: string, keep: number) =>
		messages.flatMap((m, i) => (m.role === role ? [i] : [])).slice(-keep);
	const tail = [...lastIndices("assistant", o.keepThinkingTurns), ...lastIndices("toolResult", o.keepToolResults)];
	const tailStart = tail.length ? Math.min(...tail) : messages.length;

	const calls = new Map<string, any>();
	for (const m of messages) if (m.role === "assistant") for (const c of m.content ?? []) if (c.type === "toolCall") calls.set(c.id, c);

	const savings = (m: Msg) =>
		m.role === "assistant" ? assistantSavings(m, o) : m.role === "toolResult" && resultChars(m) >= o.minPruneChars ? resultChars(m) : 0;

	const step = o.stepTokens * CHARS_PER_TOKEN;
	let sum = 0;
	let watermark = 0;
	let prunedChars = 0;
	for (let i = 0; i < tailStart; i++) {
		sum += savings(messages[i]!);
		if (Math.floor(sum / step) > Math.floor(prunedChars / step)) {
			watermark = i + 1;
			prunedChars = sum;
		}
	}

	const out = messages.map((m, i) => {
		if (i >= watermark || !savings(m)) return m;
		return m.role === "assistant" ? pruneAssistant(m, o) : pruneResult(m, calls.get(m.toolCallId));
	});
	return {
		messages: out,
		stats: {
			messages: messages.length,
			watermark,
			prunedTokens: Math.round(prunedChars / CHARS_PER_TOKEN),
			pendingTokens: Math.round((sum - prunedChars) / CHARS_PER_TOKEN),
			stepTokens: o.stepTokens,
		},
	};
}

/**
 * Sent as reasoning_budget_message with every request: when the thinking budget runs out llama.cpp forces this text,
 * then the end-of-thinking tag, and the model reads it as its own words, so it says what to do next.
 * A llama-server older than the per-request message closes the thinking silently; cuts are then detected by length (budgetVerdict).
 */
export const BUDGET_MESSAGE = "Time is up. I will take the smallest safe next step with what I know, and write my open plan into PLAN.md.";

export type BudgetPhase = "planning" | "acting"; // right after the user spoke / between tool calls
export type BudgetMode = "auto" | "fixed" | "off";

/** Starting budgets, used until a model has enough samples to learn its own. */
export const BUDGET_DEFAULTS: Record<BudgetPhase, number> = { planning: 16384, acting: 4096 };
export const BUDGET_LIMITS: Record<BudgetPhase, [number, number]> = { planning: [4096, 32768], acting: [2048, 4096] }; // acting: past ~4k between tool calls it is overthinking

const BUDGET_SAMPLES_MIN = 10;
export const BUDGET_WINDOW = 30; // thinking lengths kept per model and phase
const BUDGET_PERCENTILE = 0.95;
const BUDGET_HEADROOM = 1.5;

/** Phase of the next request, from the OpenAI-style payload: a tool result last means the agent is mid-task. */
export function requestPhase(payload: any): BudgetPhase {
	return payload?.messages?.at(-1)?.role === "tool" ? "acting" : "planning";
}

/**
 * Learned budget: 1.5 × the 95th percentile of recent thinking lengths, clamped and rounded to 1k.
 * Cuts never raise it (see budgetSample): a model that often runs away is held at its budget instead of chased.
 * Replies that finish close under the budget raise it, a model that thinks little pulls it down.
 * Undefined until there are enough samples.
 */
export function learnedBudget(samples: number[], phase: BudgetPhase): number | undefined {
	if (samples.length < BUDGET_SAMPLES_MIN) return undefined;
	const sorted = [...samples].sort((a, b) => a - b);
	const p = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * BUDGET_PERCENTILE))]!;
	const [lo, hi] = BUDGET_LIMITS[phase];
	return Math.min(hi, Math.max(lo, Math.ceil((p * BUDGET_HEADROOM) / 1024) * 1024));
}

/** The sample to learn from a reply: a cut counts as budget / headroom, so cuts alone give back the same budget. */
export function budgetSample(thought: number, budget: number, cut: boolean): number {
	return cut ? budget / BUDGET_HEADROOM : thought;
}

/**
 * What the server did with the budget sent for this reply, from the thinking length (estimated, ±10%):
 * cut near the budget, "ignored" well past it (llama-server started with its own --reasoning-budget, or too old
 * to read thinking_budget_tokens), otherwise within.
 */
export function budgetVerdict(m: Msg, budget: number): "cut" | "ignored" | "within" {
	if (thinkingWasCut(m)) return "cut";
	const thought = thinkingTokens(m);
	return thought > budget * 1.3 ? "ignored" : thought >= budget * 0.9 ? "cut" : "within";
}

/** Estimated thinking tokens of a reply (same chars/token as the hygiene). */
export function thinkingTokens(m: Msg): number {
	const chars = (m.content ?? []).reduce((n: number, c: any) => n + (c.type === "thinking" ? (c.thinking?.length ?? 0) : 0), 0);
	return Math.round(chars / CHARS_PER_TOKEN);
}

/** Whether llama.cpp cut this message's thinking at the budget. */
export function thinkingWasCut(m: Msg): boolean {
	return (m.content ?? []).some((c: any) => c.type === "thinking" && (c.thinking ?? "").trimEnd().endsWith(BUDGET_MESSAGE));
}

/**
 * Written to <project>/MAGI.md when missing, then appended to the system prompt on every run.
 * English on purpose: Qwen-family models reason in English and follow English rules more reliably.
 * Kept short: it is paid for on every request.
 */
export const MAGI_MD = `# MAGI rules for local models

These rules are appended to the system prompt by the MAGI extension. Edit them freely; delete the file to get the defaults back.

## Think less, act more
- Keep reasoning short: understand the step, decide, act. Do not re-plan what is already decided.
- Never draft code or file contents in your reasoning. Write them directly with the write/edit tool.
- If two attempts at the same approach fail, stop and change approach, or ask the user. Do not retry blindly.
- If your reasoning stopped abruptly mid-thought, or ends with "${BUDGET_MESSAGE.split(". ")[0]}.", your thinking budget ran out: in that turn make no large or irreversible change. Write your open plan into PLAN.md or take one small step you can verify; the next turn gives you a fresh budget.

## Your context is small: spend it carefully
- Search before reading: use rg/find to locate code, then read only the needed range (offset/limit).
- Do not read whole large files, and do not re-read a file you just wrote.
- Trim long command output: pipe through tail, head or rg.
- Old tool outputs and old reasoning are removed from your context automatically (marked "${PRUNED_MARK}…>>"). Anything you will need later must be written down (see below). Never copy those markers into a file.

## Keep the task state on disk
- For any task longer than a few steps, keep PLAN.md (a checklist) and NOTES.md (findings, decisions, commands that work).
- Update them after every completed step. If the context is compacted or a new session starts, continue from PLAN.md.

## Edit safely
- edit oldText must match the file exactly: copy it from a fresh read, keep it small and unique.
- If an edit fails, read that region again instead of guessing.
- For big new files: write a skeleton first, then fill it with edits. Never replace a whole file with a partial version.

## Verify, never assume
- Never invent paths, functions, APIs or flags: check with ls, rg, --help or the docs first.
- After a change, run the build, the tests or the program. Claim success only when a tool result proves it.
- If you cannot verify something, say so explicitly.

## Finish cleanly
- When done: say briefly what changed, how you verified it, and what is left.
- Answer in the user's language.
`;
