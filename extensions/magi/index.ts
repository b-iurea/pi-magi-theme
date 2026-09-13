/**
 * MAGI — a three-mind council chrome for pi
 *
 * One public-domain mythology, every symbol bound to a real function:
 *  - the TREE OF LIFE shows where the agent is: the upper triad while it thinks, the light descending
 *    to Malkuth while it answers, ascending while the model is loaded into VRAM, at rest in Malkuth when idle
 *  - the three MAGI (MELCHIOR / BALTHASAR / CASPAR) deliberate: they light up while the model thinks,
 *    give the verdict when it answers, and form the /magi council (three real models voting)
 *  - the GOLEM acts: it is animated by EMET ("truth") while tools run; a failing tool erases the aleph
 *    and EMET becomes MET ("death"). SYNC is the golem's obedience: the tool success rate
 *  - CHESED (mercy) and GEBURAH (severity) count successful and failed tools
 *  - the SEVEN SEALS measure the context window; compaction breaks the seventh seal and the world is remade
 *  - llama-swap telemetry: VRAM, GPU load/temp/power, RAM, server-side tok/s, prompt tok/s, cache hits
 *  - /magi config → assign a model to each MAGI (~/.pi/agent/magi.json)
 *
 * Artwork is original; the symbolism is public domain.
 * Use with the theme ../../themes/magi.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import type { Component, OverlayHandle, TUI } from "@earendil-works/pi-tui";
import { HStack, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/* ────────────────────────────────────────────────────────────── art ── */

const MAGI_WORD = [
	"███╗   ███╗ █████╗  ██████╗ ██╗",
	"████╗ ████║██╔══██╗██╔════╝ ██║",
	"██╔████╔██║███████║██║  ███╗██║",
	"██║╚██╔╝██║██╔══██║██║   ██║██║",
	"██║ ╚═╝ ██║██║  ██║╚██████╔╝██║",
	"╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝",
];

/** Tree of Life canvas, in terminal cells; drawn with braille dots (2×4 sub-pixels per cell). */
const TREE_W = 30;
const TREE_H = 20;

/** Sephirot in the order of the "lightning flash" (Keter → Malkuth), positioned in sub-pixels. */
const SEPHIROT = [
	{ name: "KETER", meaning: "the crown", x: 30, y: 5 },
	{ name: "CHOKMAH", meaning: "wisdom", x: 50, y: 19 },
	{ name: "BINAH", meaning: "understanding", x: 10, y: 19 },
	{ name: "CHESED", meaning: "mercy", x: 50, y: 37 },
	{ name: "GEBURAH", meaning: "severity", x: 10, y: 37 },
	{ name: "TIFERET", meaning: "beauty", x: 30, y: 46 },
	{ name: "NETZACH", meaning: "victory", x: 50, y: 55 },
	{ name: "HOD", meaning: "splendor", x: 10, y: 55 },
	{ name: "YESOD", meaning: "foundation", x: 30, y: 64 },
	{ name: "MALKUTH", meaning: "the kingdom", x: 30, y: 75 },
] as const;

/** Da'at, the hidden sephirah: drawn dashed, not part of the flash. */
const DAAT = { x: 30, y: 28 };

/** The 22 paths, as pairs of SEPHIROT indices. */
const TREE_PATHS: readonly [number, number][] = [
	[0, 1], [0, 2], [0, 5], [1, 2], [1, 5], [1, 3], [2, 5], [2, 4], [3, 4], [3, 5], [3, 6],
	[4, 5], [4, 7], [5, 6], [5, 8], [5, 7], [6, 7], [6, 8], [6, 9], [7, 8], [7, 9], [8, 9],
];

const BRAILLE_BITS = [
	[0x01, 0x08],
	[0x02, 0x10],
	[0x04, 0x20],
	[0x40, 0x80],
]; // [row][col] → dot bit

/** Rasterizes the Tree of Life into braille: paths (muted), Da'at (dim, dashed), sephirot (accent rings). */
function renderTreeOfLife(th: Theme): string[] {
	const W = TREE_W * 2;
	const H = TREE_H * 4;
	const PATH = 1;
	const DAAT_PX = 2;
	const NODE = 3;
	const px = new Uint8Array(W * H);
	const set = (x: number, y: number, v: number) => {
		const rx = Math.round(x);
		const ry = Math.round(y);
		if (rx >= 0 && ry >= 0 && rx < W && ry < H) px[ry * W + rx] = v;
	};
	for (const [a, b] of TREE_PATHS) {
		const p = SEPHIROT[a]!;
		const q = SEPHIROT[b]!;
		const n = Math.ceil(Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)));
		for (let i = 0; i <= n; i++) set(p.x + ((q.x - p.x) * i) / n, p.y + ((q.y - p.y) * i) / n, PATH);
	}
	// ring of radius r, cleared inside and with a small gap around it so paths stop short of the circle;
	// dashed rings keep every other 30° arc
	const ring = (cx: number, cy: number, r: number, v: number, dashed: boolean) => {
		for (let y = -r - 2; y <= r + 2; y++) {
			for (let x = -r - 2; x <= r + 2; x++) {
				const d = Math.hypot(x, y);
				if (d > r + 1.5) continue;
				const onRing = d > r - 0.7 && d <= r + 0.5;
				const arc = Math.floor((Math.atan2(y, x) + Math.PI) / (Math.PI / 6)) % 2 === 0;
				set(cx + x, cy + y, onRing && (!dashed || arc) ? v : 0);
			}
		}
	};
	ring(DAAT.x, DAAT.y, 3, DAAT_PX, true);
	for (const s of SEPHIROT) {
		ring(s.x, s.y, 3.5, NODE, false);
		set(s.x, s.y, NODE);
	}

	const lines: string[] = [];
	for (let row = 0; row < TREE_H; row++) {
		let line = "";
		for (let col = 0; col < TREE_W; col++) {
			let bits = 0;
			let top = 0;
			for (let dy = 0; dy < 4; dy++) {
				for (let dx = 0; dx < 2; dx++) {
					const v = px[(row * 4 + dy) * W + col * 2 + dx]!;
					if (!v) continue;
					bits |= BRAILLE_BITS[dy]![dx]!;
					top = Math.max(top, v);
				}
			}
			const ch = bits ? String.fromCharCode(0x2800 + bits) : " ";
			line += bits ? th.fg(top === NODE ? "accent" : top === DAAT_PX ? "dim" : "muted", ch) : ch;
		}
		lines.push(line);
	}
	return lines;
}

type NodeLight = "off" | "on" | "hot";

/** The ten sephirot as a tiny path: ●━●━◉─○ … (hot = where the light is now). */
function renderPath(th: Theme, lights: NodeLight[]): string {
	const glyph = (l: NodeLight) => (l === "off" ? th.fg("dim", "○") : th.fg(l === "hot" ? "warning" : "accent", "●"));
	let out = glyph(lights[0]!);
	for (let i = 1; i < lights.length; i++) {
		const joined = lights[i - 1] !== "off" && lights[i] !== "off";
		out += (joined ? th.fg("accent", "━") : th.fg("dim", "─")) + glyph(lights[i]!);
	}
	return out;
}

/** The golem, 20×8 cells: at rest, striking (arms raised), and fallen (EMET → MET). */
const GOLEM_REST = [
	"      ▄██████▄      ",
	"      █ EMET █      ",
	"      ▀██████▀      ",
	"   ▄████████████▄   ",
	"   ██ ████████ ██   ",
	"   ▀▀ ████████ ▀▀   ",
	"      ███  ███      ",
	"     ▀▀▀▀  ▀▀▀▀     ",
];
const GOLEM_STRIKE = [
	" ▄▄   ▄██████▄   ▄▄ ",
	" ██   █ EMET █   ██ ",
	" ██   ▀██████▀   ██ ",
	" ▀████████████████▀ ",
	"      ████████      ",
	"      ████████      ",
	"      ███  ███      ",
	"     ▀▀▀▀  ▀▀▀▀     ",
];
const GOLEM_FALLEN = [
	"      ▄██████▄      ",
	"      █  MET █      ",
	"      ▀██████▀      ",
	"   ▄████████████▄   ",
	"   ██ ██░███░█ ██   ",
	"   ▀▀ █░████░█ ▀▀   ",
	"      ███  ███      ",
	"     ▀▀▀▀  ▀▀▀▀     ",
];

const MAGI_UNITS = ["MELCHIOR", "BALTHASAR", "CASPAR"] as const;
type MagiUnit = (typeof MAGI_UNITS)[number];
const MAGI_TASKS = ["ANALYSIS", "SYNTHESIS", "VERIFY"] as const;

function pulseFrames(theme: Theme): string[] {
	return [
		theme.fg("dim", "◇"),
		theme.fg("warning", "◈"),
		theme.fg("accent", "◆"),
		theme.fg("error", "◆"),
		theme.fg("accent", "◆"),
		theme.fg("warning", "◈"),
	];
}

/* ─────────────────────────────────────────────────────── live state ── */

type Phase = "idle" | "thinking" | "responding" | "tool";

const state = {
	phase: "idle" as Phase,
	phaseSince: Date.now(),
	toolName: "",
	turns: 0,
	tools: 0,
	toolOk: 0, // CHESED
	toolFail: 0, // GEBURAH
	lastFailAt: 0,
	lastFailTool: "",
	runStart: 0,
	lastRunMs: 0,
	compacting: false,
	compactSince: 0,
	rebornAt: 0,
};

function setPhase(p: Phase): void {
	if (state.phase === p) return;
	state.phase = p;
	state.phaseSince = Date.now();
}

const ANIM_STEP_MS = 220;
const FAIL_FLASH_MS = 2500;
const REBIRTH_MS = 6000;

/** Golem obedience: share of tool calls that succeeded (null before the first tool). */
function syncPercent(): number | null {
	const done = state.toolOk + state.toolFail;
	return done ? (state.toolOk / done) * 100 : null;
}

/** Anything moving on screen: the agent works, the model loads, the seals break, or a tool just fell. */
function animating(now = Date.now()): boolean {
	return (
		state.phase !== "idle" ||
		swap.state === "checking" ||
		swap.state === "loading" ||
		state.compacting ||
		now - state.rebornAt < REBIRTH_MS ||
		now - state.lastFailAt < FAIL_FLASH_MS
	);
}

/** Performance of the current stream / last message. */
const perf = {
	start: 0, // message_start
	first: 0, // first delta
	chars: 0, // streamed characters (token estimate)
	tps: 0, // tokens/s of the last message (real, from usage)
	ttft: 0, // ms to first token
	lastMs: 0, // last message duration
	peakTps: 0,
};

/** tok/s: live estimate (~4 chars/token, ponytail: real token count only arrives at stream end) or last real value. */
function liveTps(): number {
	if (state.phase !== "idle" && perf.first && perf.chars) {
		const s = (Date.now() - perf.first) / 1000;
		if (s > 0.3) return perf.chars / 4 / s;
	}
	return perf.tps;
}

function fmtMs(ms: number): string {
	return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const secsSince = (t: number, now = Date.now()) => Math.max(0, Math.floor((now - t) / 1000));

const sessionStart = Date.now();

let liveCtx: ExtensionContext | undefined;

interface TokenStats {
	input: number;
	output: number;
	cacheRead: number;
	cost: number;
}

let statsCache: { at: number; value: TokenStats } = { at: 0, value: { input: 0, output: 0, cacheRead: 0, cost: 0 } };

function tokenStats(): TokenStats {
	const now = Date.now();
	if (now - statsCache.at < 500) return statsCache.value;
	const value: TokenStats = { input: 0, output: 0, cacheRead: 0, cost: 0 };
	const branch = liveCtx?.sessionManager?.getBranch?.() ?? [];
	for (const entry of branch) {
		if (entry.type === "message" && entry.message.role === "assistant") {
			const m = entry.message as AssistantMessage;
			value.input += m.usage.input;
			value.output += m.usage.output;
			value.cacheRead += m.usage.cacheRead ?? 0;
			value.cost += m.usage.cost.total;
		}
	}
	statsCache = { at: now, value };
	return value;
}

function fmtTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1_000_000).toFixed(2)}M`;
}

/** High usage is bad (context). */
function usageTone(percent: number): "success" | "warning" | "error" {
	if (percent >= 80) return "error";
	if (percent >= 50) return "warning";
	return "success";
}

/** High sync is good (tool success). */
function syncTone(percent: number): "success" | "warning" | "error" {
	if (percent >= 90) return "success";
	if (percent >= 70) return "warning";
	return "error";
}

function bar(theme: Theme, filled: number, total: number, tone: ThemeColor): string {
	const f = Math.max(0, Math.min(total, filled));
	return theme.fg(tone, "▓".repeat(f)) + theme.fg("dim", "░".repeat(total - f));
}

/** The seven seals of the context window: one breaks every 1/7 of it. */
function renderSeals(theme: Theme, percent: number): string {
	const broken = Math.min(7, Math.floor((percent / 100) * 7));
	const tone = usageTone(percent);
	return theme.fg(tone, "◉".repeat(broken)) + theme.fg("dim", "○".repeat(7 - broken));
}

/* ──────────────────────────────────────────────────── MAGI triangle ── */

interface UnitView {
	name: string;
	status: string; // max 10 cells
	tone: ThemeColor;
	lit: boolean;
}

const MAGI_DIAGRAM_WIDTH = 32;

/**
 * The three MAGI wired in a triangle: BALTHASAR on top, CASPAR bottom-left, MELCHIOR bottom-right,
 * joined through the central hub. Always exactly 32 cells wide.
 */
function magiDiagram(th: Theme, top: UnitView, left: UnitView, right: UnitView, link: ThemeColor, hub: string): string[] {
	const center = (s: string) => {
		const w = visibleWidth(s);
		const l = Math.max(0, Math.floor((10 - w) / 2));
		return " ".repeat(l) + s + " ".repeat(Math.max(0, 10 - w - l));
	};
	const edge = (u: UnitView, s: string) => th.fg(u.lit ? u.tone : "dim", s);
	const name = (u: UnitView) => (u.lit ? th.bold(th.fg(u.tone, center(u.name))) : th.fg("muted", center(u.name)));
	const stat = (u: UnitView) => th.fg(u.lit ? u.tone : "dim", center(u.status));
	const L = (s: string) => th.fg(link, s);
	const sp = (n: number) => " ".repeat(n);

	return [
		sp(10) + edge(top, "┌──────────┐") + sp(10),
		sp(6) + L("╭───") + edge(top, "┤") + name(top) + edge(top, "├") + L("───╮") + sp(6),
		sp(6) + L("│") + sp(3) + edge(top, "│") + stat(top) + edge(top, "│") + sp(3) + L("│") + sp(6),
		sp(6) + L("│") + sp(3) + edge(top, "└──────────┘") + sp(3) + L("│") + sp(6),
		" " + edge(left, "┌────") + L("┴") + edge(left, "─────┐") + sp(6) + edge(right, "┌─────") + L("┴") + edge(right, "────┐") + " ",
		" " + edge(left, "│") + name(left) + edge(left, "│") + L(hub) + edge(right, "│") + name(right) + edge(right, "│") + " ",
		" " + edge(left, "│") + stat(left) + edge(left, "│") + sp(6) + edge(right, "│") + stat(right) + edge(right, "│") + " ",
		" " + edge(left, "└──────────┘") + sp(6) + edge(right, "└──────────┘") + " ",
	];
}

/* ─────────────────────────────────────────────────────────── header ── */

/** Static header: it scrolls away with the conversation, so nothing here animates. */
function buildHeader(theme: Theme) {
	const tree = renderTreeOfLife(theme);

	return {
		render(width: number): string[] {
			const orange = (s: string) => theme.fg("accent", s);
			const dim = (s: string) => theme.fg("dim", s);
			const muted = (s: string) => theme.fg("muted", s);
			const triad = MAGI_UNITS.map((u) => theme.fg("success", u)).join(dim(" · "));
			const subtitle = "KETER → MALKUTH · 10 SEPHIROT · 22 PATHS";
			const lore = "THE MAGI JUDGE · THE GOLEM ACTS · THE SEALS KEEP TIME";

			// Narrow layout: a single identification line.
			if (width < 44) {
				return ["", orange(theme.bold("◆ MAGI")) + dim(" // ") + triad, ""].map((l) => truncateToWidth(l, width));
			}

			// Medium layout: tree on top, wordmark below.
			if (width < 70) {
				const lines = ["", ...tree, ""];
				for (const l of MAGI_WORD) lines.push(orange(l));
				lines.push(dim("├─ ") + triad + dim(" ─┤"), muted(subtitle), dim(lore), "");
				return lines.map((l) => truncateToWidth(l, width));
			}

			// Wide layout: tree left, wordmark right.
			const lines = [""];
			for (let i = 0; i < tree.length; i++) {
				let right = "";
				if (i >= 5 && i <= 10) right = orange(MAGI_WORD[i - 5]!);
				else if (i === 12) right = dim("├─ ") + triad + dim(" ─┤");
				else if (i === 13) right = muted(subtitle);
				else if (i === 14) right = dim(lore);
				lines.push(truncateToWidth(tree[i]! + "    " + right, width));
			}
			lines.push("");
			return lines;
		},
		invalidate() {},
	};
}

/* ─────────────────────────────────────────────── llama-swap monitor ── */

interface GpuStat {
	name: string;
	util: number;
	memUsed: number;
	memTotal: number;
	temp: number;
	power: number;
}

type SwapState = "off" | "checking" | "loading" | "ready" | "error";

/** Live state of the llama-swap server behind the session model (only when the provider is "llama-swap"). */
const swap = {
	base: "", // e.g. http://host:9292
	headers: {} as Record<string, string>,
	modelId: "",
	state: "off" as SwapState,
	since: 0, // when the current state started
	loadMs: 0, // how long the last real load took
	error: "",
	gpus: [] as GpuStat[],
	ramUsed: 0,
	ramTotal: 0,
	srvTps: 0, // server-measured generation tok/s of the last request
	srvPps: 0, // server-measured prompt processing tok/s
	cacheTokens: 0,
	inputTokens: 0,
};

function setSwapState(s: SwapState, error = ""): void {
	swap.state = s;
	swap.since = Date.now();
	swap.error = error;
}

function swapGet(path: string, timeoutMs = 5000): Promise<Response> {
	return fetch(swap.base + path, { headers: swap.headers, signal: AbortSignal.timeout(timeoutMs) });
}

/** Parses llama-swap's Prometheus /metrics into GPU and RAM stats. */
function parseSwapMetrics(text: string): void {
	const gpus = new Map<string, GpuStat>();
	for (const line of text.split("\n")) {
		const m = /^llamaswap_([a-z_]+)(?:\{([^}]*)\})?\s+(\S+)$/.exec(line);
		if (!m) continue;
		const key = m[1]!;
		const labels = m[2] ?? "";
		const value = Number(m[3]);
		if (key === "memory_used_bytes") swap.ramUsed = value;
		else if (key === "memory_total_bytes") swap.ramTotal = value;
		if (!key.startsWith("gpu_")) continue;
		const id = /id="([^"]*)"/.exec(labels)?.[1] ?? "0";
		const gpu = gpus.get(id) ?? { name: /name="([^"]*)"/.exec(labels)?.[1] ?? "GPU", util: 0, memUsed: 0, memTotal: 0, temp: 0, power: 0 };
		if (key === "gpu_util_percent") gpu.util = value;
		else if (key === "gpu_memory_used_bytes") gpu.memUsed = value;
		else if (key === "gpu_memory_total_bytes") gpu.memTotal = value;
		else if (key === "gpu_temperature_celsius") gpu.temp = value;
		else if (key === "gpu_power_draw_watts") gpu.power = value;
		gpus.set(id, gpu);
	}
	swap.gpus = [...gpus.entries()].sort(([a], [b]) => Number(a) - Number(b)).map(([, g]) => g);
}

async function refreshSwapMetrics(): Promise<void> {
	if (!swap.base) return;
	try {
		parseSwapMetrics(await (await swapGet("/metrics")).text());
	} catch {
		// server unreachable: keep the last values
	}
}

/** Server-side token metrics of the most recent request (/api/metrics/activity, newest first). */
async function refreshSwapActivity(): Promise<void> {
	if (!swap.base) return;
	try {
		const { data } = (await (await swapGet("/api/metrics/activity")).json()) as { data?: any[] };
		const t = data?.[0]?.tokens;
		if (!t) return;
		if (t.tokens_per_second > 0) swap.srvTps = t.tokens_per_second;
		if (t.prompt_per_second > 0) swap.srvPps = t.prompt_per_second;
		swap.cacheTokens = Math.max(0, t.cache_tokens ?? 0);
		swap.inputTokens = Math.max(0, t.input_tokens ?? 0);
	} catch {
		// metrics are optional
	}
}

/**
 * Makes sure the session model is in VRAM. Any request under /upstream/<model>/ makes llama-swap
 * load the model if needed, and it only answers once the model is ready.
 */
async function preloadModel(ctx: ExtensionContext, model: Model<any> | undefined = ctx.model): Promise<void> {
	if (!model || model.provider !== "llama-swap" || !model.baseUrl) {
		swap.base = "";
		setSwapState("off");
		return;
	}
	const id = model.id;
	swap.modelId = id;
	setSwapState("checking");
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	swap.base = model.baseUrl.replace(/\/v1\/?$/, "");
	swap.headers = {
		...((auth.ok ? auth.headers : undefined) as Record<string, string> | undefined),
		...(auth.ok && auth.apiKey ? { Authorization: `Bearer ${auth.apiKey}` } : {}),
	};
	void refreshSwapMetrics();
	void refreshSwapActivity();

	// no answer within 400ms → the model isn't in VRAM and is being loaded
	const slow = setTimeout(() => {
		if (swap.modelId === id && swap.state === "checking") setSwapState("loading");
	}, 400);
	const started = Date.now();
	try {
		const res = await swapGet(`/upstream/${encodeURIComponent(id)}/health`, 15 * 60_000);
		if (swap.modelId !== id) return; // the model changed meanwhile
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		if (swap.state === "loading") swap.loadMs = Date.now() - started;
		setSwapState("ready");
	} catch (err) {
		if (swap.modelId === id) setSwapState("error", err instanceof Error ? err.message : String(err));
	} finally {
		clearTimeout(slow);
		void refreshSwapMetrics();
	}
}

/* ─────────────────────────────────────────────────────── side panel ── */

const PANEL_WIDTH = MAGI_DIAGRAM_WIDTH + 2;

/** Frames per deliberation cycle while thinking: units light up one by one, then consensus. */
const CYCLE = 32;

class MagiPanel implements Component {
	private frame = 0;
	private timer: ReturnType<typeof setInterval> | null = null;
	/** git branch, provided by the footer (the only place pi exposes it). */
	branch?: () => string | null | undefined;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
	) {
		this.timer = setInterval(() => {
			this.frame++;
			// ~8 fps while something moves, rare refresh otherwise.
			if (animating() || this.frame % 8 === 0) this.tui.requestRender();
		}, 125);
	}

	invalidate(): void {}

	dispose(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	/* ── drawing helpers ── */

	private pad(content: string, inner: number): string {
		const w = visibleWidth(content);
		if (w > inner) return truncateToWidth(content, inner);
		return content + " ".repeat(inner - w);
	}

	private frameLine(content: string, inner: number): string {
		const b = (s: string) => this.theme.fg("border", s);
		return b("│") + this.pad(content, inner) + b("│");
	}

	private sep(inner: number, label?: string): string {
		const b = (s: string) => this.theme.fg("border", s);
		if (!label) return b("├" + "─".repeat(inner) + "┤");
		const text = ` ${truncateToWidth(label, inner - 4)} `;
		const rest = Math.max(0, inner - visibleWidth(text) - 1);
		return b("├─") + this.theme.fg("muted", text) + b("─".repeat(rest) + "┤");
	}

	private field(label: string, value: string, inner: number, tone: ThemeColor = "text"): string {
		const l = this.theme.fg("dim", label.padEnd(9));
		return this.frameLine(" " + l + this.theme.fg(tone, value), inner);
	}

	/* ── the golem: tools ── */

	private golemArt(inner: number): string[] {
		const th = this.theme;
		const fallen = Date.now() - state.lastFailAt < FAIL_FLASH_MS;
		const art = fallen ? GOLEM_FALLEN : this.frame % 4 < 2 ? GOLEM_STRIKE : GOLEM_REST;
		const tone: ThemeColor = fallen ? "error" : "accent";
		const left = " ".repeat(Math.max(0, Math.floor((inner - 20) / 2)));
		return art.map((line) => {
			const word = fallen ? "MET" : "EMET";
			const at = line.indexOf(word);
			if (at < 0) return left + th.fg(tone, line);
			return left + th.fg(tone, line.slice(0, at)) + th.bold(th.fg(fallen ? "error" : "warning", word)) + th.fg(tone, line.slice(at + word.length));
		});
	}

	/* ── MAGI triangle (thinking, verdicts, boot) or the golem (tools) ── */

	private councilSection(inner: number): string[] {
		const th = this.theme;
		const f = this.frame;
		const now = Date.now();
		let title: string;
		let body: string[];

		const idle = state.phase === "idle";
		const booting = idle && (swap.state === "checking" || swap.state === "loading");
		const offline = idle && swap.state === "error";
		const golem = state.phase === "tool" || (idle && now - state.lastFailAt < FAIL_FLASH_MS);

		if (golem) {
			const fallen = now - state.lastFailAt < FAIL_FLASH_MS;
			title = fallen
				? `GOLEM FELL · MET · ${state.lastFailTool}`
				: `GOLEM · EMET · ${state.toolName || "tool"} ${secsSince(state.phaseSince, now)}s`;
			body = this.golemArt(inner);
		} else {
			let link: ThemeColor;
			let hub: string;
			let units: UnitView[];
			const names = [...MAGI_UNITS];

			if (state.compacting || now - state.rebornAt < REBIRTH_MS) {
				// the seals break while the context is compacted; then the world is remade
				const reborn = !state.compacting;
				title = reborn ? "SEVENTH SEAL OPENED · REBORN" : `BREAKING THE SEALS ${secsSince(state.compactSince, now)}s`;
				link = reborn ? "success" : f % 4 < 2 ? "warning" : "error";
				hub = reborn ? "═MAGI═" : ["─SEAL─", "━SEAL━"][f % 2]!;
				units = names.map((name, i) =>
					reborn
						? { name, status: "REBORN", tone: "success", lit: true }
						: { name, status: "SEAL " + "◉".repeat(1 + ((Math.floor(f / 4) + i) % 3)), tone: "warning", lit: (f + i) % 3 !== 0 },
				);
			} else if (booting) {
				// MAGI boot while llama-swap loads the model into VRAM: units come online one at a time.
				const litCount = Math.floor(f / 6) % 4;
				title = swap.state === "loading" ? `BOOT · LOADING MODEL ${secsSince(swap.since, now)}s` : "BOOT · CHECKING MODEL";
				link = f % 4 < 2 ? "warning" : "dim";
				hub = ["─MAGI─", "━MAGI━"][f % 2]!;
				units = names.map((name, i) =>
					i < litCount
						? { name, status: "ONLINE", tone: "warning", lit: true }
						: { name, status: i === litCount ? "BOOT" : "·····", tone: "warning", lit: i === litCount && f % 2 === 0 },
				);
			} else if (offline) {
				title = "MAGI OFFLINE";
				link = "error";
				hub = "─ ╳ ──";
				units = names.map((name) => ({ name, status: "OFFLINE", tone: "error", lit: f % 16 < 8 }));
			} else if (idle && swap.state === "ready" && now - swap.since < 3000) {
				title = swap.loadMs ? `MAGI ONLINE · ${fmtMs(swap.loadMs)}` : "MAGI ONLINE";
				link = "success";
				hub = "═MAGI═";
				units = names.map((name) => ({ name, status: "ONLINE", tone: "success", lit: true }));
			} else if (state.phase === "thinking") {
				// Deliberation: each unit lights up in turn until all three agree, then the cycle restarts.
				const litCount = Math.min(3, Math.floor((f % CYCLE) / 8));
				const consensus = litCount === 3;
				title = consensus ? "CONSENSUS" : `DELIBERATION ${secsSince(state.phaseSince, now)}s`;
				link = consensus ? (f % 4 < 2 ? "warning" : "accent") : "accent";
				const dots = ["·    ", " ·   ", "  ·  ", "   · ", "    ·"];
				units = names.map((name, i) => {
					if (i < litCount) return { name, status: consensus ? "AGREE" : MAGI_TASKS[i]!, tone: consensus ? "warning" : "accent", lit: true };
					// the unit being processed right now flickers
					return { name, status: dots[(f + i) % dots.length]!, tone: "accent", lit: i === litCount && f % 2 === 0 };
				});
				hub = consensus ? "◆MAGI◆" : ["─MAGI─", "━MAGI━"][f % 2]!;
			} else if (state.phase === "responding") {
				title = "VERDICT: APPROVED";
				link = "success";
				hub = "═MAGI═";
				units = names.map((name) => ({ name, status: "APPROVE", tone: "success", lit: true }));
			} else {
				title = "MAGI · AWAITING QUESTION";
				link = "dim";
				hub = "─MAGI─";
				units = names.map((name) => ({ name, status: "STANDBY", tone: "success", lit: false }));
			}
			body = magiDiagram(th, units[1]!, units[2]!, units[0]!, link, hub);
		}

		const out = [this.sep(inner, title)];
		for (const l of body) out.push(this.frameLine(l, inner));

		// status row: what the agent is doing
		const pulse = animating(now) ? pulseFrames(th)[f % 6]! : th.fg("dim", "◇");
		let activity: string;
		if (state.compacting) activity = th.fg("warning", "COMPACTING");
		else if (state.phase === "tool") activity = th.fg("warning", "TOOL CALL");
		else if (state.phase === "thinking") activity = th.fg("accent", "THINKING");
		else if (state.phase === "responding") activity = th.fg("success", "RESPONDING");
		else if (booting) activity = th.fg("warning", "LOADING MODEL");
		else if (offline) activity = th.fg("error", "SERVER OFFLINE");
		else activity = th.fg("dim", "STANDBY");
		const status = `${pulse} ${activity}`;
		out.push(this.frameLine(" ".repeat(Math.max(0, Math.floor((inner - visibleWidth(status)) / 2))) + status, inner));
		return out;
	}

	render(width: number): string[] {
		const th = this.theme;
		const inner = Math.max(24, width - 2);
		const b = (s: string) => th.fg("border", s);
		const out: string[] = [];

		const title = " MAGI // SESSION MONITOR ";
		const fill = Math.max(0, inner - visibleWidth(title) - 1);
		out.push(b("┌─") + th.fg("accent", title) + b("─".repeat(fill) + "┐"));

		out.push(...this.councilSection(inner));

		// session data
		out.push(this.sep(inner, "SESSION"));
		const model = liveCtx?.model;
		out.push(this.field("MODEL", truncateToWidth(model?.id ?? "—", inner - 11), inner, "text"));
		out.push(this.field("PROVIDER", truncateToWidth(String(model?.provider ?? "—"), inner - 11), inner, "muted"));
		out.push(this.field("THINKING", liveCtx?.thinkingLevel ?? "off", inner, "muted"));
		const cwd = (liveCtx?.cwd ?? "").split("/").filter(Boolean).pop() ?? "—";
		out.push(this.field("PROJECT", truncateToWidth(cwd, inner - 11), inner, "muted"));
		const branch = this.branch?.();
		if (branch) out.push(this.field("BRANCH", truncateToWidth(branch, inner - 11), inner, "muted"));

		// telemetry
		out.push(this.sep(inner, "TELEMETRY"));
		const stats = tokenStats();
		out.push(
			this.frameLine(
				` ${th.fg("dim", "TURNS".padEnd(9))}${th.fg("text", String(state.turns).padEnd(6))}${th.fg("dim", "TOOLS ")}${th.fg("text", String(state.tools))}`,
				inner,
			),
		);
		out.push(
			this.frameLine(
				` ${th.fg("dim", "TOKENS".padEnd(9))}${th.fg("success", "↑" + fmtTokens(stats.input))} ${th.fg("warning", "↓" + fmtTokens(stats.output))}`,
				inner,
			),
		);
		if (stats.cacheRead) out.push(this.field("CACHE", fmtTokens(stats.cacheRead), inner, "muted"));
		if (stats.cost) out.push(this.field("COST", `$${stats.cost.toFixed(3)}`, inner, "muted"));

		// SYNC: the golem's obedience = tool success rate (CHESED ✓ / GEBURAH ✗)
		const sync = syncPercent();
		out.push(
			this.frameLine(
				sync === null
					? ` ${th.fg("dim", "SYNC".padEnd(9))}${th.fg("dim", "— no tools yet")}`
					: ` ${th.fg("dim", "SYNC".padEnd(9))}${bar(th, Math.round(sync / 10), 10, syncTone(sync))} ${th.fg(syncTone(sync), `${sync.toFixed(0)}%`)}`,
				inner,
			),
		);
		if (state.toolOk + state.toolFail) {
			out.push(
				this.frameLine(
					` ${th.fg("dim", "CHESED".padEnd(9))}${th.fg("success", `✓${state.toolOk}`.padEnd(6))}${th.fg("dim", "GEBURAH ")}${th.fg(state.toolFail ? "error" : "dim", `✗${state.toolFail}`)}`,
					inner,
				),
			);
		}

		// SEALS: the context window, one seal per seventh
		const usage = liveCtx?.getContextUsage?.();
		const percent = usage?.percent ?? 0;
		out.push(this.frameLine(` ${th.fg("dim", "SEALS".padEnd(9))}${renderSeals(th, percent)} ${th.fg(usageTone(percent), `${percent.toFixed(0)}%`)}`, inner));
		if (usage?.contextWindow) {
			out.push(this.field("CONTEXT", `${usage.tokens == null ? "?" : fmtTokens(usage.tokens)} / ${fmtTokens(usage.contextWindow)}`, inner, "muted"));
		}

		// performance
		out.push(this.sep(inner, "PERFORMANCE"));
		const live = state.phase !== "idle" && perf.chars > 0;
		// idle: prefer the value measured by llama-swap itself
		const tps = live ? liveTps() : swap.srvTps || perf.tps;
		out.push(
			this.frameLine(
				` ${th.fg("dim", "TOK/S".padEnd(9))}${th.fg(live ? "accent" : "success", tps ? tps.toFixed(1) : "—")}${live ? th.fg("dim", " ~live") : swap.srvTps ? th.fg("dim", " server") : ""}`,
				inner,
			),
		);
		if (swap.srvPps) out.push(this.field("PROMPT/S", swap.srvPps.toFixed(1), inner, "muted"));
		// llama-swap's input_tokens are the prompt tokens processed outside the cache
		const promptTotal = swap.cacheTokens + swap.inputTokens;
		if (promptTotal) {
			const hit = Math.round((swap.cacheTokens / promptTotal) * 100);
			out.push(this.field("KV CACHE", `${fmtTokens(swap.cacheTokens)}/${fmtTokens(promptTotal)} hit ${hit}%`, inner, "muted"));
		}
		out.push(this.field("PEAK", perf.peakTps ? `${perf.peakTps.toFixed(1)} tok/s` : "—", inner, "muted"));
		out.push(this.field("TTFT", perf.ttft ? fmtMs(perf.ttft) : "—", inner, "muted"));
		out.push(this.field("DURATION", perf.lastMs ? fmtMs(perf.lastMs) : "—", inner, "muted"));
		const up = Math.floor((Date.now() - sessionStart) / 60000);
		out.push(this.field("UPTIME", `${Math.floor(up / 60)}h ${String(up % 60).padStart(2, "0")}m`, inner, "muted"));

		// llama-swap server
		if (swap.base) {
			out.push(this.sep(inner, "LLAMA-SWAP"));
			const st =
				swap.state === "ready"
					? th.fg("success", "IN VRAM")
					: swap.state === "error"
						? th.fg("error", "OFFLINE")
						: th.fg("warning", swap.state === "loading" ? `LOADING ${secsSince(swap.since)}s` : "CHECKING");
			const load = swap.state === "ready" && swap.loadMs ? th.fg("dim", ` load ${fmtMs(swap.loadMs)}`) : "";
			out.push(this.frameLine(` ${th.fg("dim", "STATUS".padEnd(9))}${st}${load}`, inner));
			if (swap.state === "error") out.push(this.frameLine(" " + th.fg("error", swap.error), inner));
			const gib = (n: number) => n / 2 ** 30;
			for (const [i, g] of swap.gpus.entries()) {
				const pct = g.memTotal ? (g.memUsed / g.memTotal) * 100 : 0;
				out.push(
					this.frameLine(
						` ${th.fg("dim", `VRAM${i}`.padEnd(9))}${bar(th, Math.round(pct / 10), 10, "accent")} ${th.fg("muted", `${gib(g.memUsed).toFixed(1)}/${Math.round(gib(g.memTotal))}G`)}`,
						inner,
					),
				);
				out.push(
					this.frameLine(
						` ${th.fg("dim", `GPU${i}`.padEnd(9))}${th.fg(g.util > 0 ? "accent" : "muted", `${Math.round(g.util)}%`.padEnd(6))}${th.fg(g.temp >= 80 ? "error" : "muted", `${Math.round(g.temp)}°C`.padEnd(7))}${th.fg("muted", `${Math.round(g.power)}W`)}`,
						inner,
					),
				);
			}
			if (swap.ramTotal) out.push(this.field("RAM", `${gib(swap.ramUsed).toFixed(1)} / ${Math.round(gib(swap.ramTotal))}G`, inner, "muted"));
		}

		out.push(b("└" + "─".repeat(inner) + "┘"));
		return out.map((l) => truncateToWidth(l, width));
	}
}

/* ─────────────────────────────────────────────── MAGI deliberation ── */

type Vote = "APPROVE" | "CONDITIONAL" | "REJECT";

function voteTone(v: string | null | undefined): "success" | "warning" | "error" {
	return v === "APPROVE" ? "success" : v === "CONDITIONAL" ? "warning" : "error";
}

/** Three minds, three useful engineering viewpoints. */
const MAGI = [
	{
		unit: "MELCHIOR",
		nature: "PRAGMATIST",
		persona:
			"You are MELCHIOR, the pragmatist of the MAGI council: a senior engineer. Judge by: does it solve the actual problem, " +
			"the simplest solution that works, effort versus value, reuse of what already exists (stdlib, current stack, existing code), " +
			"time to ship. Call out over-engineering, speculative abstractions and unnecessary dependencies.",
	},
	{
		unit: "BALTHASAR",
		nature: "GUARDIAN",
		persona:
			"You are BALTHASAR, the guardian of the MAGI council: a protective reliability and security architect. Judge by: failure modes, " +
			"security, data safety, operability (monitoring, rollback, being paged at 3am), maintainability for the team, " +
			"backward compatibility and hidden long-term costs. Say what will break and how to prevent it.",
	},
	{
		unit: "CASPAR",
		nature: "VISIONARY",
		persona:
			"You are CASPAR, the visionary of the MAGI council: a creative, lateral-thinking architect. Judge by: is there a better framing of " +
			"the problem, more elegant or unconventional alternatives, developer and user experience, and how the design will evolve " +
			"over the next year. Always propose at least one alternative the other two would likely miss.",
	},
] as const satisfies readonly { unit: MagiUnit; nature: string; persona: string }[];

const MAGI_RULES = `You are one of the three MAGI deliberating on a question from a software engineer (coding, software architecture, infrastructure).
Answer strictly from your own nature: the other two MAGI cover the other viewpoints.
Reply in the same language as the question.
Output format, no preamble:
VOTE: APPROVE | CONDITIONAL | REJECT
- then at most 5 short bullet points (about 120 words total)
For CONDITIONAL, the bullets must state the conditions. If the question is open-ended rather than yes/no, give your recommendation and vote on the direction the question implies.`;

interface MagiOpinion {
	unit: string;
	nature: string;
	model: string;
	vote: Vote | null;
	text: string;
	error?: string;
}

interface Deliberation {
	question: string;
	opinions: MagiOpinion[];
	verdict: Vote | null;
	tally: number;
}

/* ── config: ~/.pi/agent/magi.json → { "MELCHIOR": { "model": "provider/id", "thinking": "low" }, … } ── */

interface MagiUnitConfig {
	model?: string;
	thinking?: string;
}
type MagiConfig = Partial<Record<MagiUnit, MagiUnitConfig>>;

const MAGI_CONFIG_PATH = join(homedir(), ".pi", "agent", "magi.json");

function loadMagiConfig(): MagiConfig {
	try {
		return JSON.parse(readFileSync(MAGI_CONFIG_PATH, "utf8"));
	} catch {
		return {};
	}
}

function parseVote(text: string): Vote {
	const m = /VOTE:\s*\**\s*(APPROVE|CONDITIONAL|REJECT)/i.exec(text);
	return m ? (m[1]!.toUpperCase() as Vote) : "CONDITIONAL";
}

/** Majority vote; no majority (all different) → CONDITIONAL; no valid votes → null. */
function tallyVerdict(votes: (Vote | null)[]): { verdict: Vote | null; tally: number } {
	const counts = new Map<Vote, number>();
	for (const v of votes) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
	let verdict: Vote | null = null;
	let tally = 0;
	for (const [v, c] of counts) {
		if (c > tally) {
			verdict = v;
			tally = c;
		}
	}
	if (tally === 1 && counts.size > 1) verdict = "CONDITIONAL";
	return { verdict, tally };
}

/** Recent user/assistant text from the current branch, so the MAGI know what "this" refers to. */
function conversationExcerpt(ctx: ExtensionContext, maxChars = 6000): string {
	const parts: string[] = [];
	for (const e of ctx.sessionManager.getBranch()) {
		if (e.type !== "message") continue;
		const m = e.message as any;
		if (m.role !== "user" && m.role !== "assistant") continue;
		const text =
			typeof m.content === "string"
				? m.content
				: (m.content as any[]).filter((c) => c.type === "text").map((c) => c.text).join("\n");
		if (text.trim()) parts.push(`${m.role.toUpperCase()}: ${text.trim()}`);
	}
	const joined = parts.join("\n\n");
	return joined.length > maxChars ? "…" + joined.slice(-maxChars) : joined;
}

function resolveModel(ctx: ExtensionContext, ref?: string): Model<any> | undefined {
	if (!ref) return ctx.model;
	const slash = ref.indexOf("/");
	return slash > 0 ? ctx.modelRegistry.find(ref.slice(0, slash), ref.slice(slash + 1)) : undefined;
}

async function askMagi(
	ctx: ExtensionContext,
	index: number,
	prompt: string,
	cfg: MagiConfig,
	signal: AbortSignal,
): Promise<MagiOpinion> {
	const magi = MAGI[index]!;
	const unitCfg = cfg[magi.unit] ?? {};
	const model = resolveModel(ctx, unitCfg.model);
	const base = { unit: magi.unit, nature: magi.nature, model: model ? `${model.provider}/${model.id}` : (unitCfg.model ?? "—") };
	const fail = (error: string): MagiOpinion => ({ ...base, vote: null, text: "", error });
	if (!model) return fail(unitCfg.model ? `model not found: ${unitCfg.model}` : "no session model");

	try {
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) return fail((auth as any).error ?? "no credentials for this model");
		const target = auth.baseUrl ? { ...model, baseUrl: auth.baseUrl } : model;
		const thinking = model.reasoning && unitCfg.thinking && unitCfg.thinking !== "off" ? unitCfg.thinking : undefined;
		const res = await completeSimple(
			target,
			{ systemPrompt: `${magi.persona}\n\n${MAGI_RULES}`, messages: [{ role: "user", content: prompt, timestamp: Date.now() }] },
			{ apiKey: auth.apiKey, headers: auth.headers, signal, reasoning: thinking as any },
		);
		if (res.stopReason === "error" || res.stopReason === "aborted") return fail(res.errorMessage ?? res.stopReason);
		const text = res.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("")
			.trim();
		return { ...base, vote: parseVote(text), text: text.replace(/^[\s*]*VOTE:.*(\n|$)/i, "").trim() };
	} catch (err) {
		return fail(err instanceof Error ? err.message : String(err));
	}
}

function buildDeliberationView(
	tui: TUI,
	theme: Theme,
	question: string,
	opinions: (MagiOpinion | undefined)[],
	isDone: () => boolean,
	close: (cancelled: boolean) => void,
) {
	let tick = 0;
	const timer = setInterval(() => {
		tick++;
		tui.requestRender();
	}, 100);

	return {
		render(width: number): string[] {
			const dim = (s: string) => theme.fg("dim", s);
			const inner = Math.max(MAGI_DIAGRAM_WIDTH, Math.min(width - 2, 64));
			const pad = (s: string) => {
				const t = truncateToWidth(s, inner);
				return t + " ".repeat(Math.max(0, inner - visibleWidth(t)));
			};
			const row = (s: string) => theme.fg("accent", "║") + pad(s) + theme.fg("accent", "║");
			const done = isDone();

			const out: string[] = [];
			out.push(theme.fg("accent", "╔" + "═".repeat(inner) + "╗"));
			out.push(row(theme.bold(theme.fg("accent", " MAGI COUNCIL")) + dim(" :: DELIBERATION")));
			out.push(theme.fg("accent", "╟" + "─".repeat(inner) + "╢"));
			out.push(row(" " + theme.fg("muted", question)));
			out.push(row(""));

			// Pending units flicker until their model answers.
			const spin = ["◐", "◓", "◑", "◒"][tick % 4]!;
			const units: UnitView[] = MAGI_UNITS.map((name, i) => {
				const o = opinions[i];
				if (!o) return { name, status: `${spin} ···`, tone: "accent", lit: tick % 2 === 0 };
				if (!o.vote) return { name, status: "ERROR", tone: "error", lit: true };
				return { name, status: o.vote === "CONDITIONAL" ? "COND." : o.vote, tone: voteTone(o.vote), lit: true };
			});
			const { verdict, tally } = tallyVerdict(opinions.map((o) => o?.vote ?? null));
			const link: ThemeColor = done ? voteTone(verdict) : "accent";
			const hub = done ? "◆MAGI◆" : ["─MAGI─", "━MAGI━"][tick % 2]!;
			const left = " ".repeat(Math.max(0, Math.floor((inner - MAGI_DIAGRAM_WIDTH) / 2)));
			for (const l of magiDiagram(theme, units[1]!, units[2]!, units[0]!, link, hub)) out.push(row(left + l));

			out.push(row(""));
			for (let i = 0; i < MAGI.length; i++) {
				const o = opinions[i];
				const status = !o ? dim("deliberating…") : o.error ? theme.fg("error", o.error) : theme.fg(voteTone(o.vote), o.vote!);
				out.push(row(` ${theme.fg("text", MAGI[i]!.unit.padEnd(12))}${dim(MAGI[i]!.nature.padEnd(11))}${status}`));
			}
			out.push(row(""));
			if (done) {
				const label = ` VERDICT: ${verdict ?? "NO QUORUM"} (${tally}/3)`;
				out.push(row(tick % 8 < 4 ? theme.bold(theme.fg(voteTone(verdict), label)) : theme.fg("dim", label)));
			} else {
				out.push(row(dim(" VERDICT: ─────")));
			}
			out.push(theme.fg("accent", "╚" + "═".repeat(inner) + "╝"));
			out.push(dim(done ? " enter/esc: close — full opinions are shown in the chat" : " esc: abort"));
			return out.map((l) => truncateToWidth(l, width));
		},
		handleInput(data: string) {
			if (isDone()) close(false);
			else if (matchesKey(data, "escape")) close(true);
		},
		invalidate() {},
		dispose() {
			clearInterval(timer);
		},
	};
}

async function configureMagi(ctx: ExtensionContext): Promise<void> {
	const cfg = loadMagiConfig();
	const pool = ctx.scopedModels.length ? ctx.scopedModels.map((s) => s.model) : ctx.modelRegistry.getAvailable();
	const SESSION = "(session model)";
	const choices = [SESSION, ...pool.map((m) => `${m.provider}/${m.id}`)];
	for (const magi of MAGI) {
		const current = cfg[magi.unit]?.model ?? SESSION;
		const pick = await ctx.ui.select(`${magi.unit} · ${magi.nature} — model (current: ${current})`, choices);
		if (pick === undefined) {
			ctx.ui.notify("MAGI config unchanged", "info");
			return;
		}
		cfg[magi.unit] = { ...cfg[magi.unit], model: pick === SESSION ? undefined : pick };
	}
	writeFileSync(MAGI_CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
	ctx.ui.notify(`MAGI config saved to ${MAGI_CONFIG_PATH}`, "info");
}

/* ──────────────────────────────────────────────────────────── footer ── */

/**
 * The footer's left side, one animation per real state of the agent:
 *  - seals breaking / seventh seal opened → context compaction
 *  - golem EMET / MET                     → tool running / tool failed
 *  - light pulsing in the upper triad     → thinking
 *  - light descending to Malkuth          → streaming the answer
 *  - light ascending from Malkuth         → loading the model into VRAM
 *  - at rest in Malkuth                   → idle
 */
function footerLeft(th: Theme, now = Date.now()): string {
	const dim = (s: string) => th.fg("dim", s);
	const step = Math.floor(now / ANIM_STEP_MS);
	const lights = (fn: (i: number) => NodeLight) => SEPHIROT.map((_, i) => fn(i));

	if (state.compacting) {
		const broken = step % 8;
		return (
			th.fg("warning", "✶ ") +
			th.fg("warning", "◉".repeat(broken)) +
			dim("○".repeat(7 - broken)) +
			th.fg("warning", " BREAKING THE SEALS") +
			dim(` · compacting context ${secsSince(state.compactSince, now)}s`)
		);
	}
	if (now - state.rebornAt < REBIRTH_MS) {
		return (
			th.fg("success", "✶ ") +
			renderPath(th, lights(() => (step % 2 ? "on" : "hot"))) +
			th.fg("success", " SEVENTH SEAL OPENED") +
			dim(" · context compacted, the world is remade")
		);
	}
	if (state.phase === "tool" || now - state.lastFailAt < FAIL_FLASH_MS) {
		const sync = syncPercent();
		const tally = th.fg("success", ` CHESED ✓${state.toolOk}`) + th.fg(state.toolFail ? "error" : "dim", ` GEBURAH ✗${state.toolFail}`);
		const syncText = sync === null ? "" : dim(" · sync ") + th.fg(syncTone(sync), `${sync.toFixed(0)}%`);
		if (now - state.lastFailAt < FAIL_FLASH_MS) {
			return th.fg("error", "✗ GOLEM · MET") + dim(" · ") + th.fg("error", `${state.lastFailTool} failed`) + dim(" ·") + tally + syncText;
		}
		const hammer = ["▚", "▞"][step % 2]!;
		return (
			th.fg("accent", `${hammer} GOLEM · `) +
			th.bold(th.fg("warning", "EMET")) +
			dim(" · ") +
			th.fg("text", state.toolName || "tool") +
			dim(` ${secsSince(state.phaseSince, now)}s ·`) +
			tally +
			syncText
		);
	}
	if (state.phase === "thinking") {
		const cur = Math.floor(step / 2) % 3; // Keter, Chokmah, Binah
		const s = SEPHIROT[cur]!;
		return (
			th.fg("accent", "◆ ") +
			renderPath(th, lights((i) => (i === cur ? "hot" : i < 3 ? "on" : "off"))) +
			th.fg("warning", ` ${s.name}`) +
			dim(` · ${s.meaning} · thinking ${secsSince(state.phaseSince, now)}s`)
		);
	}
	if (state.phase === "responding") {
		const cur = 5 + (step % 5); // Tiferet → Malkuth
		const s = SEPHIROT[cur]!;
		const tps = liveTps();
		return (
			th.fg("success", "◆ ") +
			renderPath(th, lights((i) => (i === cur ? "hot" : i < cur ? "on" : "off"))) +
			th.fg("warning", ` ${s.name}`) +
			dim(` · ${s.meaning} · manifesting${tps ? ` ${tps.toFixed(1)} tok/s` : ""}`)
		);
	}
	if (swap.state === "checking" || swap.state === "loading") {
		const cur = 9 - (step % 10); // Malkuth → Keter
		return (
			th.fg("warning", "▲ ") +
			renderPath(th, lights((i) => (i === cur ? "hot" : i > cur ? "on" : "off"))) +
			th.fg("warning", ` ASCENT`) +
			dim(` · loading model into VRAM ${secsSince(swap.since, now)}s`)
		);
	}
	const last = state.lastRunMs ? ` · last run ${fmtMs(state.lastRunMs)}` : "";
	return th.fg("success", "○ ") + th.fg("muted", "MALKUTH") + dim(` · the kingdom · at rest${last}`);
}

/** Footer: the animation on the left, other extensions' statuses on the right. */
function buildFooter(tui: TUI, theme: Theme, footerData: any) {
	const timer = setInterval(() => {
		if (animating()) tui.requestRender();
	}, ANIM_STEP_MS);

	const unsub = footerData?.onBranchChange?.(() => tui.requestRender());

	return {
		render(width: number): string[] {
			const dim = (s: string) => theme.fg("dim", s);
			const statuses = footerData?.getExtensionStatuses?.();
			const right = statuses ? [...statuses.values()].filter(Boolean).join(dim(" │ ")) : "";
			const room = Math.max(12, width - visibleWidth(right) - 2);
			const l = truncateToWidth(footerLeft(theme), room);
			const gap = Math.max(1, width - visibleWidth(l) - visibleWidth(right));
			return [truncateToWidth(l + " ".repeat(gap) + right, width)];
		},
		invalidate() {},
		dispose() {
			clearInterval(timer);
			unsub?.();
		},
	};
}

/* ───────────────────────────────────────────────────────── extension ── */

export default function (pi: ExtensionAPI) {
	let chrome = true;
	let panelEnabled = true;
	let tuiRef: TUI | undefined;
	let panelHandle: OverlayHandle | undefined;
	let panel: MagiPanel | undefined;

	const repaint = () => tuiRef?.requestRender();

	let footerDataRef: any;
	let wrappedRoot: any; // pi's original root, when the panel is a fullscreen column

	const showPanel = (theme: Theme) => {
		if (!tuiRef || panel || !panelEnabled) return;
		panel = new MagiPanel(tuiRef, theme);
		panel.branch = () => footerDataRef?.getGitBranch?.();

		// Fullscreen: a real column next to the conversation → stays put while the chat scrolls.
		// ponytail: reads TuiAltScreen's private layoutRoot field; if pi renames it, falls back to the overlay.
		const t = tuiRef as any;
		if (t.mode === "fullscreen" && t.layoutRoot && typeof t.setLayoutRoot === "function") {
			wrappedRoot = t.layoutRoot;
			t.setLayoutRoot(
				new HStack(
					[
						{ component: wrappedRoot, basis: 0, grow: 1, shrink: 1, minSize: 40 },
						{ component: panel, basis: PANEL_WIDTH, grow: 0, shrink: 0, visible: (vp) => vp.width >= PANEL_WIDTH + 56 },
					],
					{ gap: 1 },
				),
			);
			tuiRef.requestRender();
			return;
		}

		// Regular mode: the terminal owns scrollback, so the overlay scrolls with it.
		panelHandle = tuiRef.showOverlay(panel, {
			nonCapturing: true, // doesn't steal the keyboard
			anchor: "top-right",
			width: PANEL_WIDTH,
			maxHeight: "92%",
			margin: { top: 1, right: 1, bottom: 1 },
			// hides itself on narrow terminals
			visible: (termWidth) => termWidth >= PANEL_WIDTH + 56,
		});
	};

	const hidePanel = () => {
		if (wrappedRoot) {
			(tuiRef as any)?.setLayoutRoot?.(wrappedRoot);
			wrappedRoot = undefined;
		}
		panelHandle?.hide();
		panel?.dispose();
		panelHandle = undefined;
		panel = undefined;
	};

	const applyChrome = (ctx: ExtensionContext) => {
		if (ctx.mode !== "tui") return;
		if (!chrome) {
			hidePanel();
			ctx.ui.setHeader(undefined);
			ctx.ui.setFooter(undefined);
			ctx.ui.setWorkingIndicator();
			ctx.ui.setWorkingMessage();
			ctx.ui.setWidget("magi-hook", undefined);
			return;
		}
		// invisible widget: only used to grab the TUI reference
		ctx.ui.setWidget("magi-hook", (tui, theme) => {
			tuiRef = tui;
			queueMicrotask(() => showPanel(theme));
			return { render: () => [], invalidate: () => {} };
		});
		ctx.ui.setHeader((_tui, theme) => buildHeader(theme));
		ctx.ui.setFooter((tui, theme, footerData) => {
			tuiRef = tui;
			footerDataRef = footerData;
			return buildFooter(tui, theme, footerData);
		});
		ctx.ui.setWorkingIndicator({ frames: pulseFrames(ctx.ui.theme), intervalMs: 110 });
		ctx.ui.setTitle("MAGI");
	};

	pi.registerEntryRenderer("magi-verdict", (entry: any, _options: any, theme: Theme) => {
		const d = entry.data as Deliberation;
		return {
			render(width: number): string[] {
				const out = [theme.fg("accent", "◆ MAGI COUNCIL") + theme.fg("dim", " :: ") + theme.fg("muted", d.question)];
				for (const o of d.opinions ?? []) {
					out.push("");
					const head = o.error ? theme.fg("error", "ERROR") : theme.bold(theme.fg(voteTone(o.vote), o.vote!));
					out.push(theme.bold(theme.fg("accent", o.unit)) + theme.fg("dim", ` · ${o.nature} · ${o.model}  `) + head);
					for (const line of (o.error ?? o.text).split("\n")) {
						for (const w of wrapTextWithAnsi(theme.fg(o.error ? "error" : "text", line), Math.max(10, width - 2))) out.push("  " + w);
					}
				}
				out.push("", theme.bold(theme.fg(voteTone(d.verdict), `VERDICT: ${d.verdict ?? "NO QUORUM"} (${d.tally}/3)`)));
				return out.map((l) => truncateToWidth(l, width));
			},
			invalidate() {},
		};
	});

	let metricsTimer: ReturnType<typeof setInterval> | undefined;

	pi.on("session_start", async (_event, ctx) => {
		liveCtx = ctx;
		if (ctx.mode !== "tui") return;
		applyChrome(ctx);
		// load the model into VRAM now (animated in the panel and footer) and keep GPU stats fresh
		void preloadModel(ctx);
		metricsTimer ??= setInterval(() => void refreshSwapMetrics(), 3000);
		metricsTimer.unref?.();
	});

	pi.on("model_select", async (event, ctx) => {
		liveCtx = ctx;
		if (ctx.mode === "tui") void preloadModel(ctx, event.model);
	});

	pi.on("session_shutdown", async () => {
		clearInterval(metricsTimer);
		metricsTimer = undefined;
		hidePanel();
	});

	pi.on("agent_start", async () => {
		state.runStart = Date.now();
	});

	pi.on("turn_start", async (_event, ctx) => {
		liveCtx = ctx;
		state.turns++;
		setPhase("thinking");
		if (ctx.mode === "tui" && chrome) ctx.ui.setWorkingMessage("the MAGI deliberate…");
		repaint();
	});

	pi.on("message_start", async (event) => {
		if (event.message.role !== "assistant") return;
		perf.start = Date.now();
		perf.first = 0;
		perf.chars = 0;
	});

	// The panel tells "thinking" from "responding" by reading the stream.
	pi.on("message_update", async (event, ctx) => {
		liveCtx = ctx;
		const e = event.assistantMessageEvent as any;
		const t = e?.type;
		if (t === "thinking_start" || t === "thinking_delta") setPhase("thinking");
		else if (t === "text_start" || t === "text_delta") setPhase("responding");
		else if (t === "toolcall_start" || t === "toolcall_delta") setPhase("tool");
		if (typeof e?.delta === "string" && e.delta) {
			if (!perf.first) perf.first = Date.now();
			perf.chars += e.delta.length;
		}
	});

	pi.on("message_end", async (event) => {
		if (event.message.role !== "assistant" || !perf.start) return;
		const m = event.message as AssistantMessage;
		const end = Date.now();
		perf.lastMs = end - perf.start;
		if (perf.first) {
			perf.ttft = perf.first - perf.start;
			const genS = (end - perf.first) / 1000;
			const out = m.usage?.output || perf.chars / 4;
			if (genS > 0.05 && out) {
				perf.tps = out / genS;
				perf.peakTps = Math.max(perf.peakTps, perf.tps);
			}
		}
		perf.start = 0;
		repaint();
		// llama-swap records the request once it completes
		setTimeout(() => void refreshSwapActivity().then(repaint), 300);
	});

	pi.on("tool_execution_start", async (event, ctx) => {
		liveCtx = ctx;
		setPhase("tool");
		state.toolName = event.toolName ?? "";
		state.tools++;
		repaint();
	});

	// CHESED (mercy) counts what worked, GEBURAH (severity) what failed; a failure erases the golem's aleph.
	pi.on("tool_execution_end", async (event) => {
		if (event.isError) {
			state.toolFail++;
			state.lastFailAt = Date.now();
			state.lastFailTool = event.toolName ?? "tool";
		} else {
			state.toolOk++;
		}
		repaint();
	});

	pi.on("agent_settled", async (_event, ctx) => {
		liveCtx = ctx;
		if (state.runStart) state.lastRunMs = Date.now() - state.runStart;
		state.runStart = 0;
		setPhase("idle");
		state.toolName = "";
		if (ctx.mode === "tui" && chrome) ctx.ui.setWorkingMessage();
		repaint();
	});

	// The seven seals: compaction breaks them, and the context is reborn.
	pi.on("session_before_compact", async () => {
		state.compacting = true;
		state.compactSince = Date.now();
		repaint();
	});

	pi.on("session_compact", async () => {
		state.compacting = false;
		state.rebornAt = Date.now();
		repaint();
	});

	pi.on("session_compact_failed", async () => {
		state.compacting = false;
		repaint();
	});

	pi.registerCommand("magi", {
		description: "Ask the three MAGI (pragmatist, guardian, visionary); /magi config assigns a model to each",
		handler: async (args, ctx) => {
			const arg = args.trim();
			if (arg === "config") return configureMagi(ctx);

			const question = arg || (await ctx.ui.input("Question for the MAGI:", "should we …?"))?.trim() || "";
			if (!question) return;

			const cfg = loadMagiConfig();
			const project = (ctx.cwd ?? "").split("/").filter(Boolean).pop() ?? "";
			const prompt =
				`Project: ${project}\n\nRecent conversation (context only, may be empty):\n<conversation>\n${conversationExcerpt(ctx)}\n</conversation>\n\n` +
				`Question for the MAGI:\n${question}`;

			const controller = new AbortController();
			const opinions: (MagiOpinion | undefined)[] = MAGI.map(() => undefined);
			let finished = false;
			const all = Promise.all(
				MAGI.map((_, i) =>
					askMagi(ctx, i, prompt, cfg, controller.signal).then((o) => {
						opinions[i] = o;
						return o;
					}),
				),
			).finally(() => {
				finished = true;
			});

			if (ctx.mode === "tui") {
				const cancelled = await ctx.ui.custom<boolean>((tui, theme, _keys, done) =>
					buildDeliberationView(tui, theme, question, opinions, () => finished, done),
				);
				if (cancelled) {
					controller.abort();
					ctx.ui.notify("MAGI deliberation aborted", "warning");
					return;
				}
			}

			const final = await all;
			const { verdict, tally } = tallyVerdict(final.map((o) => o.vote));
			pi.appendEntry("magi-verdict", { question, opinions: final, verdict, tally } satisfies Deliberation);
		},
	});

	pi.registerCommand("magi-ui", {
		description: "MAGI chrome: enable the theme, or manage chrome and side panel (on|off|panel)",
		handler: async (args, ctx) => {
			liveCtx = ctx;
			const arg = args.trim().toLowerCase();

			if (arg === "panel") {
				panelEnabled = !panelEnabled;
				if (panelEnabled) showPanel(ctx.ui.theme);
				else hidePanel();
				ctx.ui.notify(`Side panel ${panelEnabled ? "enabled" : "disabled"}`, "info");
				return;
			}
			if (arg === "off" || arg === "on") {
				chrome = arg === "on";
				applyChrome(ctx);
				ctx.ui.notify(`MAGI chrome ${chrome ? "enabled" : "disabled"}`, "info");
				return;
			}

			const res = ctx.ui.setTheme("magi");
			if (!res.success) {
				ctx.ui.notify(`Theme magi not found: ${res.error}`, "error");
				return;
			}
			chrome = true;
			applyChrome(ctx);
			ctx.ui.notify("MAGI online — /magi-ui panel, /magi-ui off", "info");
		},
	});
}
