/**
 * MAGI — a three-mind council chrome for pi
 *
 * One public-domain mythology, every symbol bound to a real function:
 *  - the panel draws the three MAGI as the panels of their control screen
 *  - the sephirot of the Tree of Life show where the agent is: the upper triad while it thinks, the light descending
 *    to Malkuth while it answers, ascending while the model is loaded into VRAM, at rest in Malkuth when idle
 *  - the three MAGI (MELCHIOR / BALTHASAR / CASPAR) flicker while the agent works, showing what it is doing,
 *    and form the /magi council: three real models voting (on a question, or on the pending git diff)
 *  - the session's MECHA unit acts while tools run, showing the file or command it works on, and goes berserk when one fails;
 *    a failing tool erases the aleph and EMET becomes MET ("death"). SYNC is the tool success rate
 *  - CHESED (mercy) and GEBURAH (severity) count successful and failed tools
 *  - the SEVEN SEALS measure the context window; the sixth warns before compaction, the seventh opens when it runs
 *  - MECHA SELECT: a new llama-swap session loads nothing until you pick the unit (model) to activate;
 *    each model gets a MECHA head, lit when it is already in VRAM, waking while it loads;
 *    /magi mecha reopens it
 *  - while a model loads an angel attacks the MAGI: red spreads through BALTHASAR, MELCHIOR and CASPAR at the pace of
 *    the model's last load, a corner of CASPAR holds out blinking; once loaded, blue takes the MAGI back from that corner
 *  - llama-swap telemetry: VRAM, GPU load/temp/power, energy used, RAM, server-side tok/s, prompt tok/s, cache hits
 *  - /magi config → assign a model to each MAGI; /magi-ui compact|status → smaller panel, llama-swap report
 *
 * Fan art: the MAGI and their screen come from Neon Genesis Evangelion, all rights reserved to khara, Inc.
 * Use with the theme ../../themes/magi.json
 */

import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import type { Component, OverlayHandle, TUI } from "@earendil-works/pi-tui";
import { HStack, matchesKey, sliceByColumn, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/* ────────────────────────────────────────────────────────────── art ── */

const MAGI_WORD = [
	"███╗   ███╗ █████╗  ██████╗ ██╗",
	"████╗ ████║██╔══██╗██╔════╝ ██║",
	"██╔████╔██║███████║██║  ███╗██║",
	"██║╚██╔╝██║██╔══██║██║   ██║██║",
	"██║ ╚═╝ ██║██║  ██║╚██████╔╝██║",
	"╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝",
];

/** The seven-eyed seal, 26×11 cells of braille, traced from the original emblem. */
const SEELE_LOGO = [
	" ⠹⡍⠉⠉⠉⠉⠉⠉⠉⠉⠉⢹⠉⠉⠉⠉⠉⠉⠉⣉⡉⠉⢩⠇",
	"⣠⠖⠛⢩⠋⠉⢯⠙⠲⢤⡀ ⢸  ⢠⣴⠚⠉⡝⠉⠙⡍⠙⢲⣤",
	" ⠙⠒⠾⡷⠴⠿⠖⠚⠁  ⢸   ⠈⠙⠒⠻⠶⣾⠗⠚⠉",
	" ⢀⣠⣤⣼⢦⣤⣤⣀   ⢸   ⢀⣀⡤⢤⠴⢧⠤⣄⣀",
	"⠺⢭⣀⣸⡁ ⣽⣀⣨⠽⠂ ⢸  ⠐⠫⢤⣀⣯⡀⣠⣇⣀⡬⠓",
	"   ⠉⠉⠉⠙⣇    ⢸     ⡼⠉⠉⠉⠉",
	"⣠⠖⠚⢩⠏⠉⢯⠙⠓⢦⡀ ⢸  ⢀⡴⠚⠋⡽⠉⠙⡍⠓⠲⣄",
	" ⠙⠒⠾⠷⠴⠿⠖⠚⢧  ⢸  ⢀⡼⠛⠒⠿⠦⠾⠗⠚⠉",
	"         ⠈⢧ ⢸ ⢀⡞ ⣀⣤⢤⡤⣤⣤⣄⡀",
	"          ⠈⢧⢸⢀⡞⠐⠯⣅⣀⣯ ⢈⣇⣀⡭⠗",
	"            ⢻⡟    ⠈⠉⠉⠉⠉",
];
const SEELE_WIDTH = 26;

const SYSTEM_WORD = [
	"███████╗██╗   ██╗███████╗████████╗███████╗███╗   ███╗",
	"██╔════╝╚██╗ ██╔╝██╔════╝╚══██╔══╝██╔════╝████╗ ████║",
	"███████╗ ╚████╔╝ ███████╗   ██║   █████╗  ██╔████╔██║",
	"╚════██║  ╚██╔╝  ╚════██║   ██║   ██╔══╝  ██║╚██╔╝██║",
	"███████║   ██║   ███████║   ██║   ███████╗██║ ╚═╝ ██║",
	"╚══════╝   ╚═╝   ╚══════╝   ╚═╝   ╚══════╝╚═╝     ╚═╝",
];

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

/* ── MECHA units: the heads of the model picker, one unit per model llama-swap runs ── */

type MechaUnit = "I" | "II" | "III" | "LEGION";
type MechaState = "dormant" | "waking" | "active" | "berserk";
type Rgb = readonly [number, number, number];

/**
 * Heads of 13×7 cells. mask: e = eyes (the light), a = accent, anything else = armor.
 * jaw: rows that replace the art from row `at` while the unit wakes (the jaw lock breaks).
 * Colors are the units' own, outside the theme palette on purpose.
 */
const MECHA: Record<MechaUnit, { name: string; armor: Rgb; accent: Rgb; eyes: Rgb; art: string[]; mask: string[]; jaw: { at: number; rows: string[] } }> = {
	"I": {
		name: "MECHA-I",
		armor: [124, 82, 196],
		accent: [132, 222, 84],
		eyes: [170, 255, 120],
		art: [
			"      ▲      ",
			"     ███     ",
			"   ▄█████▄   ",
			"  ██▀▀█▀▀██  ",
			"  █ ◣   ◢ █  ",
			"  ▀█▄▄█▄▄█▀  ",
			"    ▀▄▄▄▀    ",
		],
		mask: [
			"             ",
			"             ",
			"             ",
			"    aa aa    ",
			"    e   e    ",
			"             ",
			"    aaaaa    ",
		],
		jaw: { at: 5, rows: ["  ▀█▀▀▀▀▀█▀  ", "   █▄▀▄▀▄█   "] },
	},
	"II": {
		name: "MECHA-II",
		armor: [236, 140, 44],
		accent: [90, 160, 255],
		eyes: [120, 200, 255],
		art: [
			"    ▄▄▄▄▄    ",
			"  ▄█▀▀▀▀▀█▄  ",
			" ▐█  ▄▄▄  █▌ ",
			" ▐█  ███  █▌ ",
			"  ▀█▄▄▄▄▄█▀  ",
			"    ▀███▀    ",
			"             ",
		],
		mask: [
			"    aaaaa    ",
			"             ",
			"     eee     ",
			"     eee     ",
			"             ",
			"             ",
			"             ",
		],
		jaw: { at: 5, rows: ["    ▀▄▀▄▀    "] },
	},
	"III": {
		name: "MECHA-III",
		armor: [214, 40, 44],
		accent: [245, 160, 40],
		eyes: [120, 255, 160],
		art: [
			" ◥▄       ▄◤ ",
			"  ██▄▄▄▄▄██  ",
			"  █ ●   ● █  ",
			"  █  ● ●  █  ",
			"  ▀██▄▄▄██▀  ",
			"    ▀███▀    ",
			"             ",
		],
		mask: [
			" aa       aa ",
			"             ",
			"    e   e    ",
			"     e e     ",
			"             ",
			"             ",
			"             ",
		],
		jaw: { at: 4, rows: ["  ▀█▀▄▀▄▀█▀  ", "   ▀▄▀▄▀▄▀   "] },
	},
	LEGION: {
		name: "LEGION",
		armor: [228, 228, 232],
		accent: [205, 40, 64],
		eyes: [255, 90, 110],
		art: [
			"     ▄▄▄     ",
			"   ▄█████▄   ",
			"  ▐███████▌  ",
			"  ▐█▀▄▀▄▀█▌  ",
			"   ▀▄▀▄▀▄▀   ",
			"             ",
			"             ",
		],
		mask: [
			"             ",
			"             ",
			"             ",
			"    eeeee    ",
			"   eeeeeee   ",
			"             ",
			"             ",
		],
		jaw: { at: 3, rows: ["  ▐█▄▀▄▀▄█▌  ", "   ▄▀▄▀▄▀▄   "] },
	},
};

/** Every head is drawn on the same 13×7 grid. */
const MECHA_W = 13;

const rgb = ([r, g, b]: Rgb, s: string) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`;
const shade = (c: Rgb, k: number): Rgb => [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];

/** The berserk eyes: the unit off its leash sees in red, whatever colour its own eyes are. */
const BERSERK_EYES: Rgb = [255, 40, 40];

/**
 * One MECHA head: dormant (dark, eyes off), waking (eyes flicker, the jaw lock breaks),
 * active (armor lit, eyes pulse), berserk (jaw wide open, red eyes, a tool just failed).
 */
function renderMechaHead(unit: MechaUnit, state: MechaState, frame: number): string[] {
	const u = MECHA[unit];
	const jawOpen = state === "berserk" || (state === "waking" && frame % 8 < 4);
	const eyesOn = state === "active" || state === "berserk" || (state === "waking" && flicker(frame, 7));
	const armor = state === "dormant" ? shade(u.armor, 0.3) : state === "waking" ? shade(u.armor, 0.7) : u.armor;
	const accent = state === "dormant" ? shade(u.accent, 0.3) : u.accent;
	const eyes =
		state === "berserk"
			? shade(BERSERK_EYES, 0.7 + 0.3 * Math.sin(frame / 1.5)) // the roar throbs faster than the sync pulse
			: eyesOn
				? shade(u.eyes, state === "active" ? 0.75 + 0.25 * Math.sin(frame / 3) : 1)
				: shade(u.eyes, 0.18);
	return u.art.map((row, r) => {
		const jaw = jawOpen ? u.jaw.rows[r - u.jaw.at] : undefined;
		const art = jaw ?? row;
		let out = "";
		for (let c = 0; c < art.length; c++) {
			const ch = art[c]!;
			const m = u.mask[r]![c];
			out += ch === " " ? " " : rgb(m === "e" ? eyes : m === "a" ? accent : armor, ch);
		}
		return out;
	});
}

/** MECHA-I goes to the default model, II and III to the next real models, the rest is the LEGION. */
function assignMechaUnits(realIds: string[], defaultRealId: string): Map<string, MechaUnit> {
	const order = [...new Set(realIds.includes(defaultRealId) ? [defaultRealId, ...realIds] : realIds)];
	const units: MechaUnit[] = ["I", "II", "III"];
	return new Map(order.map((id, i) => [id, units[i] ?? "LEGION"]));
}

/**
 * The unit of every llama-swap model, stable across /model switches: MECHA-I is settings.json's defaultModel.
 * ponytail: reads only the global settings, a project .pi/settings.json override is ignored.
 */
function mechaUnitsOf(ctx: ExtensionContext, aliases: Map<string, string>): Map<string, MechaUnit> {
	let def = ctx.model?.id ?? "";
	try {
		def = JSON.parse(readFileSync(join(homedir(), ".pi", "agent", "settings.json"), "utf8")).defaultModel || def;
	} catch {
		// no settings: the session model leads
	}
	const realOf = (id: string) => aliases.get(id) ?? id;
	const ids = ctx.modelRegistry.getAvailable().filter((m) => m.provider === "llama-swap").map((m) => realOf(m.id));
	return assignMechaUnits(ids, realOf(def));
}

const MAGI_UNITS = ["MELCHIOR", "BALTHASAR", "CASPAR"] as const;
type MagiUnit = (typeof MAGI_UNITS)[number];

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

/** Pseudo-random on/off per unit, changing every `hold` frames: the MAGI flicker while they work. */
function flicker(frame: number, unit: number, hold = 2): boolean {
	const x = Math.imul(Math.floor(frame / hold) + 1, 2654435761) ^ Math.imul(unit + 1, 40503);
	return (x >>> 0) % 100 < 55;
}

/* ─────────────────────────────────────────────────────── live state ── */

type Phase = "idle" | "thinking" | "responding" | "tool";
type Vote = "APPROVE" | "CONDITIONAL" | "REJECT";

const state = {
	phase: "idle" as Phase,
	phaseSince: Date.now(),
	toolName: "",
	toolTarget: "", // file or command the current tool works on
	turns: 0,
	toolOk: 0, // CHESED
	toolFail: 0, // GEBURAH
	unit: "I" as MechaUnit, // the session model's own unit: it is the one that acts while a tool runs
	lastFailAt: 0,
	lastFailTool: "",
	lastFailTarget: "",
	runStart: 0,
	lastRunMs: 0,
	compacting: false,
	compactSince: 0,
	compactBy: "", // who opens the seals: "smart-compact" (pi-smart-compact package) or "pi native"
	rebornAt: 0,
	hasSmartCompact: false,
	lastCouncil: undefined as { verdict: Vote | null; tally: number; question: string } | undefined,
};

/** Panel preferences, persisted under "ui" in ~/.pi/agent/magi.json. */
type Currency = "EUR" | "USD";

const ui = {
	compact: false,
	kwhPrice: undefined as number | undefined, // price per kWh, for the COST row (/magi-ui config)
	currency: "EUR" as Currency,
};

function fmtMoney(value: number): string {
	const digits = value < 1 ? 3 : 2;
	return ui.currency === "USD" ? `$${value.toFixed(digits)}` : `${value.toFixed(digits)} €`;
}

function setPhase(p: Phase): void {
	if (state.phase === p) return;
	state.phase = p;
	state.phaseSince = Date.now();
}

const ANIM_STEP_MS = 220;
/** How long one Sephirah stays lit in the footer: its name and meaning are text, they need time to be read. */
const SEPHIRAH_STEP_MS = 1400;
const FAIL_FLASH_MS = 2500;
const REBIRTH_MS = 6000;
const DONE_TITLE_AFTER_MS = 30_000;
const SIXTH_SEAL_PERCENT = (6 / 7) * 100;
/** Footer marquee: one cell every FOOTER_SCROLL_MS, with this gap between the loop's end and its start. */
const FOOTER_SCROLL_MS = 260;
const FOOTER_SCROLL_GAP = "   ·   ";

/** Sync ratio: share of tool calls that succeeded (null before the first tool). */
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
		(swap.state === "ready" && now - swap.since < ONLINE_MS) ||
		state.compacting ||
		now - state.rebornAt < REBIRTH_MS ||
		now - state.lastFailAt < FAIL_FLASH_MS
	);
}

/** What a tool works on, from its arguments: a path, a command, a pattern, or the first short string. */
function toolTarget(args: unknown): string {
	if (!args || typeof args !== "object") return "";
	const a = args as Record<string, unknown>;
	for (const key of ["path", "file_path", "filePath", "command", "cmd", "pattern", "query", "url"]) {
		if (typeof a[key] === "string" && a[key]) return String(a[key]).replace(/\s+/g, " ").trim();
	}
	const first = Object.values(a).find((v) => typeof v === "string" && v.length > 0 && v.length < 200);
	return typeof first === "string" ? first.replace(/\s+/g, " ").trim() : "";
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

/* ── token totals: counted once per message instead of rescanning the whole session ── */

interface TokenStats {
	input: number;
	output: number;
	cacheRead: number;
	cost: number;
}

const tokens: TokenStats = { input: 0, output: 0, cacheRead: 0, cost: 0 };

function addUsage(m: AssistantMessage): void {
	tokens.input += m.usage?.input ?? 0;
	tokens.output += m.usage?.output ?? 0;
	tokens.cacheRead += m.usage?.cacheRead ?? 0;
	tokens.cost += m.usage?.cost?.total ?? 0;
}

/** Full recount: on session start and when switching branch. Also restores the last council verdict. */
function recountSession(ctx: ExtensionContext): void {
	Object.assign(tokens, { input: 0, output: 0, cacheRead: 0, cost: 0 });
	state.lastCouncil = undefined;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "message" && entry.message.role === "assistant") addUsage(entry.message as AssistantMessage);
		if (entry.type === "custom" && entry.customType === "magi-verdict") {
			const d = entry.data as { verdict?: Vote | null; tally?: number; question?: string } | undefined;
			if (d && Array.isArray((d as any).opinions)) state.lastCouncil = { verdict: d.verdict ?? null, tally: d.tally ?? 0, question: d.question ?? "" };
		}
	}
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

/** The seven seals of the context window: one breaks every 1/7 of it; the sixth blinks as a warning. */
function renderSeals(theme: Theme, percent: number, now = Date.now()): string {
	const broken = Math.min(7, Math.floor((percent / 100) * 7));
	const tone = usageTone(percent);
	let out = "";
	for (let i = 0; i < 7; i++) {
		if (i >= broken) out += theme.fg("dim", "○");
		else if (broken === 6 && i === 5) out += theme.fg(Math.floor(now / 500) % 2 ? "warning" : "error", "◉");
		else out += theme.fg(tone, "◉");
	}
	return out;
}

/* ──────────────────────────────────────────────────── MAGI triangle ── */

interface UnitView {
	name: string;
	status: string; // max 10 cells
	tone: ThemeColor;
	lit: boolean;
}

const MAGI_DIAGRAM_WIDTH = 32;

/* ── MAGI screen: pixel art drawn with half blocks, two pixels per cell (one above the other) ── */

/**
 * The three MAGI as the panels of their control screen, 32×20 pixels: B = BALTHASAR, C = CASPAR, M = MELCHIOR
 * (CASPAR and MELCHIOR are mirror images), o = the wires joining them.
 */
const MAGI_SCREEN = [
	"..........BBBBBBBBBBBB..........",
	"..........BBBBBBBBBBBB..........",
	"..........BBBBBBBBBBBB..........",
	"..........BBBBBBBBBBBB..........",
	"..........BBBBBBBBBBBB..........",
	"..........BBBBBBBBBBBB..........",
	"..........BBBBBBBBBBBB..........",
	"..........BBBBBBBBBBBB..........",
	"...........BBBBBBBBBB...........",
	"...........oBBBBBBBBo...........",
	"CCCCCCCC..oo.BBBBBB.oo..MMMMMMMM",
	"CCCCCCCCCoo..........ooMMMMMMMMM",
	"CCCCCCCCCC............MMMMMMMMMM",
	"CCCCCCCCCCC..........MMMMMMMMMMM",
	"CCCCCCCCCCCC........MMMMMMMMMMMM",
	"CCCCCCCCCCCCC......MMMMMMMMMMMMM",
	"CCCCCCCCCCCCC......MMMMMMMMMMMMM",
	"CCCCCCCCCCCCCooooooMMMMMMMMMMMMM",
	"CCCCCCCCCCCCC......MMMMMMMMMMMMM",
	"CCCCCCCCCCCCC......MMMMMMMMMMMMM",
];

interface ScreenLabel {
	row: number;
	center: number;
	text: string;
	fg: string; // SGR foreground escape
}

const SCREEN_TEAL = "\x1b[38;2;64;180;220m";
const SCREEN_TEAL_DARK = "\x1b[38;2;22;62;78m";
const SCREEN_INK = "\x1b[38;2;10;10;10m";
const SGR_RESET = "\x1b[0m";
const toBg = (fg: string) => fg.replace("[38;", "[48;");

/** Paints each pixel of a rows×2 by cols grid, then writes the labels in bold over whatever is under them. */
function renderScreen(rows: number, cols: number, at: (y: number, x: number) => string | undefined, labels: readonly ScreenLabel[]): string[] {
	const cells = Array.from({ length: rows }, (_, r) =>
		Array.from({ length: cols }, (_, c) => {
			const top = at(r * 2, c);
			const bot = at(r * 2 + 1, c);
			if (!top && !bot) return " ";
			if (top === bot) return top + "█" + SGR_RESET;
			if (top && bot) return top + toBg(bot) + "▀" + SGR_RESET;
			return top ? top + "▀" + SGR_RESET : bot + "▄" + SGR_RESET;
		}),
	);
	for (const l of labels) {
		const chars = [...l.text];
		const start = Math.round(l.center - chars.length / 2);
		chars.forEach((ch, i) => {
			const c = start + i;
			const row = cells[l.row];
			if (!row || c < 0 || c >= row.length) return;
			const under = at(l.row * 2, c);
			row[c] = (under ? toBg(under) : "") + l.fg + "\x1b[1m" + ch + SGR_RESET;
		});
	}
	return cells.map((r) => r.join(""));
}

/* ── the angel attack: red spreads through the MAGI while a model loads, blue takes them back when it is ready ── */

const SCREEN_RED = "\x1b[38;2;206;36;24m";
/** CASPAR's bottom-left corner: the red never gets there; once everything else has fallen it blinks until the model is loaded. */
const SAFE_PIXELS = new Set(["18,0", "18,1", "19,0", "19,1"]);
const LOAD_DEFAULT_MS = 60_000;
const RECOVER_MS = 1_600;
const ONLINE_MS = 3_000;

/** Blocky noise (2×2 pixel blocks), stable across renders: makes the front ragged like a corrupted screen. */
const blockNoise = (y: number, x: number) => {
	const h = Math.sin(Math.floor(y / 2) * 127.1 + Math.floor(x / 2) * 311.7) * 43758.5453;
	return h - Math.floor(h);
};

/** Pixel → 0..1 order in which it falls: BALTHASAR, then MELCHIOR, then CASPAR, each from where the previous one touches it. */
const INFECTION_ORDER: ReadonlyMap<string, number> = (() => {
	const entry: Record<string, { unit: number; y: number; x: number }> = {
		B: { unit: 0, y: 0, x: 10 },
		M: { unit: 1, y: 10, x: 22 },
		C: { unit: 2, y: 10, x: 9 },
	};
	const byUnit = new Map<string, { key: string; d: number }[]>();
	MAGI_SCREEN.forEach((row, y) =>
		[...row].forEach((ch, x) => {
			const e = entry[ch];
			if (!e || SAFE_PIXELS.has(`${y},${x}`)) return;
			const list = byUnit.get(ch) ?? [];
			list.push({ key: `${y},${x}`, d: Math.hypot(y - e.y, x - e.x) + blockNoise(y, x) * 7 });
			byUnit.set(ch, list);
		}),
	);
	const order = new Map<string, number>();
	for (const [ch, list] of byUnit) {
		list.sort((a, b) => a.d - b.d);
		list.forEach((p, i) => order.set(p.key, (entry[ch]!.unit + i / list.length) / 3));
	}
	return order;
})();

/** Pixel → 0..1 order in which blue takes it back, spreading from the safe corner. */
const RECOVERY_ORDER: ReadonlyMap<string, number> = (() => {
	const list: { key: string; d: number }[] = [];
	MAGI_SCREEN.forEach((row, y) =>
		[...row].forEach((ch, x) => {
			if ("BCM".includes(ch)) list.push({ key: `${y},${x}`, d: Math.hypot(y - 19, x) + blockNoise(y, x) * 7 });
		}),
	);
	list.sort((a, b) => a.d - b.d);
	return new Map(list.map((p, i) => [p.key, i / list.length]));
})();

/** How far the attack went (0..1) and how far the recovery is (0..1); blink toggles the safe corner. */
interface Virus {
	infected: number;
	recovered: number;
	blink: boolean;
}

/**
 * The MAGI screen with each unit's name and status: a lit unit is filled (blue, or its state's color),
 * a dark one is dimmed; the wires and the hub stay orange. 32×10 cells.
 */
function magiDiagram(th: Theme, top: UnitView, left: UnitView, right: UnitView, hub: string, virus?: Virus): string[] {
	const fill = (u: UnitView) => (!u.lit ? SCREEN_TEAL_DARK : u.tone === "accent" ? SCREEN_TEAL : th.getFgAnsi(u.tone));
	const ink = (u: UnitView) => (u.lit ? SCREEN_INK : th.getFgAnsi("muted"));
	const wire = th.getFgAnsi("accent");
	const unit = (u: UnitView, row: number, name: number, status: number): ScreenLabel[] => [
		{ row, center: name, text: u.name, fg: ink(u) },
		{ row: row + 1, center: status, text: u.status, fg: ink(u) },
	];
	const paint: Record<string, string> = { B: fill(top), C: fill(left), M: fill(right), o: wire };
	const at = (y: number, x: number) => {
		const ch = MAGI_SCREEN[y]![x]!;
		if (virus && ch !== "o" && ch !== ".") {
			const key = `${y},${x}`;
			// the last stronghold: it blinks only once everything else has fallen, until the recovery starts
			if (SAFE_PIXELS.has(key)) return virus.infected >= 1 && virus.recovered <= 0 && virus.blink ? SCREEN_TEAL_DARK : SCREEN_TEAL;
			if ((INFECTION_ORDER.get(key) ?? 1) < virus.infected && (RECOVERY_ORDER.get(key) ?? 0) >= virus.recovered) return SCREEN_RED;
		}
		return paint[ch];
	};
	return renderScreen(
		10,
		MAGI_DIAGRAM_WIDTH,
		at,
		[...unit(top, 2, 16, 16), ...unit(left, 7, 6, 6), ...unit(right, 7, 26, 26), { row: 7, center: 16, text: hub, fg: wire }],
	);
}

/* ─────────────────────────────────────────────────────────── header ── */

/** Static header: it scrolls away with the conversation, so nothing here animates. */
function buildHeader(theme: Theme) {
	return {
		render(width: number): string[] {
			const orange = (s: string) => theme.fg("accent", s);
			const note = theme.fg("dim", "fan-art theme inspired by Neon Genesis Evangelion · all rights reserved to khara, Inc.");
			const oneLine = MAGI_WORD.map((l, i) => l + "    " + SYSTEM_WORD[i]);
			const stacked = [...MAGI_WORD, "", ...SYSTEM_WORD];
			const word = width >= SEELE_WIDTH + 4 + oneLine[0]!.length ? oneLine : stacked;

			let lines: string[];
			if (width >= SEELE_WIDTH + 4 + word[0]!.length) {
				// the seal on the left of the wordmark, both centered on the taller one
				const h = Math.max(SEELE_LOGO.length, word.length);
				const sealAt = Math.floor((h - SEELE_LOGO.length) / 2);
				const wordAt = Math.floor((h - word.length) / 2);
				lines = Array.from({ length: h }, (_, i) => {
					const seal = (SEELE_LOGO[i - sealAt] ?? "").padEnd(SEELE_WIDTH);
					const w = word[i - wordAt];
					return theme.fg("text", seal) + (w ? "    " + orange(w) : "");
				});
			} else if (width >= SYSTEM_WORD[0]!.length) {
				lines = stacked.map(orange);
			} else {
				lines = [orange(theme.bold("◆ MAGI SYSTEM"))];
			}
			return ["", ...lines, note, ""].map((l) => truncateToWidth(l, width));
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

type SwapState = "off" | "checking" | "loading" | "ready" | "asleep" | "error";

/** Live state of the llama-swap server behind the session model (only when the provider is "llama-swap"). */
const swap = {
	base: "", // e.g. http://host:9292
	headers: {} as Record<string, string>,
	modelId: "", // the id pi uses (may be an alias)
	realId: "", // the model llama-swap actually runs for that id
	state: "off" as SwapState,
	since: 0, // when the current state started
	loadMs: 0, // how long the last real load took
	expectedLoadMs: LOAD_DEFAULT_MS, // how long this model took to load last time
	infection: 0, // how far the red went when the model became ready (0 = it was already in VRAM)
	error: "",
	gpus: [] as GpuStat[],
	ramUsed: 0,
	ramTotal: 0,
	srvTps: 0, // server-measured generation tok/s of the last request
	srvPps: 0, // server-measured prompt processing tok/s
	cacheTokens: 0,
	inputTokens: 0,
	energyWh: 0, // GPU energy since the session started
	lastSampleAt: 0,
	lastWatts: 0,
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

/**
 * Integrates GPU power over time into Wh.
 * ponytail: trapezoid over the 3–30s poll samples, GPUs only; gaps over 60s are clamped.
 */
function sampleEnergy(now = Date.now()): void {
	const watts = swap.gpus.reduce((sum, g) => sum + g.power, 0);
	if (swap.lastSampleAt) {
		const dtH = Math.min(60_000, now - swap.lastSampleAt) / 3_600_000;
		swap.energyWh += ((swap.lastWatts + watts) / 2) * dtH;
	}
	swap.lastSampleAt = now;
	swap.lastWatts = watts;
}

async function refreshSwapMetrics(): Promise<void> {
	if (!swap.base) return;
	try {
		parseSwapMetrics(await (await swapGet("/metrics")).text());
		sampleEnergy();
	} catch {
		// server unreachable: keep the last values
	}
}

/** Notices when llama-swap unloaded the session model (e.g. its ttl expired) so the panel can say so. */
async function refreshSwapRunning(): Promise<void> {
	if (!swap.base || swap.state !== "ready") return;
	try {
		const { running } = (await (await swapGet("/running")).json()) as { running?: { model: string }[] };
		if (!(running ?? []).some((r) => r.model === swap.realId)) setSwapState("asleep");
	} catch {
		// optional
	}
}

/** Server-side token metrics of the most recent request: a single row from /api/metrics/activity. */
async function refreshSwapActivity(): Promise<void> {
	if (!swap.base) return;
	try {
		const { data } = (await (await swapGet("/api/metrics/activity?limit=1")).json()) as { data?: any[] };
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

/** Context filled right now in llama-server's busy slot: prompt tokens placed so far plus the ones generated. */
const live = { tokens: 0, at: 0 };
const LIVE_POLL_MS = 500;
const LIVE_STALE_MS = 2_000;

/**
 * Reads the busy slot of the session model (llama-server /slots): n_prompt_tokens grows batch by batch
 * while the prompt is processed, then token by token while the model thinks and answers.
 * ponytail: with several slots it takes the fullest busy one, assuming it is this session's request.
 */
async function refreshLiveContext(): Promise<void> {
	if (!swap.base || swap.state !== "ready") return;
	try {
		const slots = (await (await swapGet(`/upstream/${encodeURIComponent(swap.realId)}/slots`, 1_500)).json()) as any[];
		const busy = slots.filter((s) => s.is_processing && s.n_prompt_tokens > 0);
		if (!busy.length) return;
		live.tokens = Math.max(...busy.map((s) => s.n_prompt_tokens));
		live.at = Date.now();
	} catch {
		// the pi estimate stays
	}
}

/** Context usage for the seals: live from the slot while the model works, pi's estimate otherwise. */
function contextUsage(): { tokens: number | null; contextWindow: number; percent: number; live: boolean } | undefined {
	const usage = liveCtx?.getContextUsage?.();
	if (!usage) return undefined;
	if (state.phase !== "idle" && usage.contextWindow && Date.now() - live.at < LIVE_STALE_MS) {
		return { tokens: live.tokens, contextWindow: usage.contextWindow, percent: Math.min(100, (live.tokens / usage.contextWindow) * 100), live: true };
	}
	return { tokens: usage.tokens, contextWindow: usage.contextWindow, percent: usage.percent ?? 0, live: false };
}

/** id → the model llama-swap actually runs for it: an alias (e.g. "… - Instruct") runs another model. */
async function swapAliases(): Promise<Map<string, string>> {
	const aliases = new Map<string, string>();
	try {
		const { data } = (await (await swapGet("/v1/models")).json()) as { data?: any[] };
		for (const m of data ?? []) {
			const ls = m.meta?.llamaswap;
			aliases.set(m.id, ls?.type === "alias" && ls.modelID ? ls.modelID : m.id);
		}
	} catch {
		// ids stay as they are
	}
	return aliases;
}

/** Models llama-swap keeps in memory: real id → "ready" | "starting" | … (empty when the server is unreachable). */
async function swapRunning(): Promise<Map<string, string>> {
	try {
		const { running } = (await (await swapGet("/running")).json()) as { running?: { model: string; state: string }[] };
		return new Map((running ?? []).map((r) => [r.model, r.state]));
	} catch {
		return new Map();
	}
}

/** Points the llama-swap monitor at the server behind `model`, without loading anything; false when llama-swap doesn't serve it. */
async function connectSwap(ctx: ExtensionContext, model: Model<any> | undefined): Promise<boolean> {
	if (!model || model.provider !== "llama-swap" || !model.baseUrl) {
		swap.base = "";
		setSwapState("off");
		return false;
	}
	const id = model.id;
	swap.modelId = id;
	swap.realId = id;
	setSwapState("checking");
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	swap.base = model.baseUrl.replace(/\/v1\/?$/, "");
	swap.headers = {
		...((auth.ok ? auth.headers : undefined) as Record<string, string> | undefined),
		...(auth.ok && auth.apiKey ? { Authorization: `Bearer ${auth.apiKey}` } : {}),
	};
	void refreshSwapMetrics();
	void refreshSwapActivity();
	const aliases = await swapAliases();
	if (swap.modelId !== id) return true;
	swap.realId = aliases.get(id) ?? id;
	return true;
}

/** Shows whether the session model is already in VRAM or asleep, without loading it: typing wakes it. */
async function probeModel(ctx: ExtensionContext, model: Model<any> | undefined = ctx.model): Promise<void> {
	if (!(await connectSwap(ctx, model))) return;
	const state = (await swapRunning()).get(swap.realId);
	if (swap.modelId === model!.id) setSwapState(state === "ready" ? "ready" : "asleep");
}

/**
 * Makes sure the session model is in VRAM. Any request under /upstream/<model>/ makes llama-swap
 * load the model if needed, and it only answers once the model is ready.
 */
async function preloadModel(ctx: ExtensionContext, model: Model<any> | undefined = ctx.model): Promise<void> {
	if (!(await connectSwap(ctx, model))) return;
	const id = model!.id;
	swap.expectedLoadMs = loadMagiConfig().loads?.[swap.realId] ?? LOAD_DEFAULT_MS;

	// no answer within 400ms → the model isn't in VRAM and is being loaded
	const slow = setTimeout(() => {
		if (swap.modelId === id && swap.state === "checking") setSwapState("loading");
	}, 400);
	const started = Date.now();
	try {
		const res = await swapGet(`/upstream/${encodeURIComponent(id)}/health`, 15 * 60_000);
		if (swap.modelId !== id) return; // the model changed meanwhile
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const loaded = swap.state === "loading";
		if (loaded) {
			swap.loadMs = Date.now() - started;
			swap.infection = Math.min(1, swap.loadMs / swap.expectedLoadMs);
			const cfg = loadMagiConfig();
			saveMagiConfig({ ...cfg, loads: { ...cfg.loads, [swap.realId]: swap.loadMs } });
		} else swap.infection = 0;
		setSwapState("ready");
		if (!ctx.sessionManager.getBranch().some((e) => e.type === "message")) void prewarmPrefix(ctx.cwd);
	} catch (err) {
		if (swap.modelId === id) setSwapState("error", err instanceof Error ? err.message : String(err));
	} finally {
		clearTimeout(slow);
		void refreshSwapMetrics();
	}
}

/* ── prefix prewarm: a new session's system prompt and tools are processed before its first message ── */

/**
 * ~/.pi/agent/magi-prefix.json: "<project dir>\n<model id>" → the request body every new session shares
 * (the system message, tools and request options of pi's last real request), so the prewarmed text is identical.
 */
const PREFIX_STORE_PATH = join(homedir(), ".pi", "agent", "magi-prefix.json");

const prewarm = { state: "" as "" | "running" | "done", tokens: 0, ms: 0, abort: undefined as AbortController | undefined };
let prefixMemo = "";

function loadPrefixStore(): Record<string, any> {
	try {
		return JSON.parse(readFileSync(PREFIX_STORE_PATH, "utf8"));
	} catch {
		return {};
	}
}

/** Keeps the shared part of pi's real llama-swap request; written only when it changes (new tools, another thinking level…). */
function rememberPrefix(cwd: string, payload: any): void {
	if (!swap.base || payload?.model !== swap.modelId || payload.messages?.[0]?.role !== "system") return;
	const { stream, stream_options, max_tokens, max_completion_tokens, messages, ...options } = payload;
	const body = { ...options, messages: [messages[0]] };
	const json = JSON.stringify(body);
	if (json === prefixMemo) return;
	prefixMemo = json;
	const store = loadPrefixStore();
	store[`${cwd}\n${payload.model}`] = body;
	writeFileSync(PREFIX_STORE_PATH, JSON.stringify(store));
}

/**
 * Processes the stored prefix so llama-server checkpoints the state exactly where a new session's prompt diverges:
 * the first message then costs its own tokens (seconds) instead of the whole system prompt and tools (~80s cold).
 * ponytail: cuts at the ChatML user marker (Qwen and most llama.cpp templates); other templates are skipped.
 */
async function prewarmPrefix(cwd: string): Promise<void> {
	const body = loadPrefixStore()[`${cwd}\n${swap.modelId}`];
	if (!body || prewarm.state === "running") return;
	const abort = new AbortController();
	prewarm.abort = abort;
	prewarm.state = "running";
	const started = Date.now();
	const post = async (path: string, json: unknown): Promise<any> =>
		(
			await fetch(`${swap.base}/upstream/${encodeURIComponent(swap.realId)}${path}`, {
				method: "POST",
				headers: { ...swap.headers, "Content-Type": "application/json" },
				body: JSON.stringify(json),
				signal: abort.signal,
			})
		).json();
	try {
		// the template renders only with a user turn: the prefix ends where that turn starts
		const { prompt } = await post("/apply-template", { ...body, messages: [...body.messages, { role: "user", content: "." }] });
		const cut = typeof prompt === "string" ? prompt.indexOf("<|im_start|>user") : -1;
		if (cut <= 0) {
			prewarm.state = "";
			return;
		}
		const { timings } = await post("/completion", { prompt: prompt.slice(0, cut), n_predict: 1, cache_prompt: true });
		prewarm.tokens = (timings?.prompt_n ?? 0) + (timings?.cache_n ?? 0);
		prewarm.ms = Date.now() - started;
		prewarm.state = "done";
	} catch {
		// aborted by the first message, or the server went away
		prewarm.state = "";
	}
}

/* ── /magi-ui status: a report built from the last requests llama-swap recorded ── */

interface ActivityRow {
	timestamp: string;
	model: string;
	resp_status_code: number;
	duration_ms: number;
	tokens?: {
		cache_tokens?: number;
		input_tokens?: number;
		output_tokens?: number;
		prompt_per_second?: number;
		tokens_per_second?: number;
		draft_tokens?: number;
		draft_acc_tokens?: number;
	};
}

const ACTIVITY_REPORT_ROWS = 100;

function activityReport(th: Theme, rows: ActivityRow[], total: number, now = Date.now()): string[] {
	const dim = (s: string) => th.fg("dim", s);
	const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
	const ago = (iso: string) => {
		const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
		return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`;
	};
	const out = [th.fg("accent", th.bold("LLAMA-SWAP STATUS")) + dim(` · last ${rows.length} of ${total} requests`)];
	const byModel = new Map<string, ActivityRow[]>();
	for (const r of rows) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r]);

	for (const [model, rs] of byModel) {
		const t = rs.map((r) => r.tokens ?? {});
		const sum = (k: keyof NonNullable<ActivityRow["tokens"]>) => t.reduce((a, x) => a + Math.max(0, x[k] ?? 0), 0);
		const errors = rs.filter((r) => r.resp_status_code >= 400).length;
		const gen = mean(t.map((x) => x.tokens_per_second ?? 0).filter((v) => v > 0));
		const prompt = mean(t.map((x) => x.prompt_per_second ?? 0).filter((v) => v > 0));
		const cached = sum("cache_tokens");
		const input = sum("input_tokens");
		const draft = sum("draft_tokens");
		const accepted = sum("draft_acc_tokens");
		const durations = rs.map((r) => r.duration_ms).sort((a, b) => a - b);
		const p95 = durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))] ?? 0;
		out.push("", th.fg("text", th.bold(model)));
		out.push(dim("  requests ") + th.fg("text", String(rs.length)) + dim(" · errors ") + th.fg(errors ? "error" : "success", String(errors)) + dim(` · last ${ago(rs[0]!.timestamp)}`));
		out.push(
			dim("  speed    ") +
				th.fg("success", `gen ${gen.toFixed(1)} tok/s`) +
				dim(" · ") +
				th.fg("text", `prompt ${prompt.toFixed(1)} tok/s`) +
				(draft ? dim(" · draft accepted ") + th.fg("text", `${Math.round((accepted / draft) * 100)}%`) : ""),
		);
		out.push(
			dim("  tokens   ") +
				th.fg("text", `in ${fmtTokens(input)} · cached ${fmtTokens(cached)}`) +
				dim(` (hit ${cached + input ? Math.round((cached / (cached + input)) * 100) : 0}%)`) +
				th.fg("text", ` · out ${fmtTokens(sum("output_tokens"))}`),
		);
		out.push(dim("  duration ") + th.fg("text", `avg ${fmtMs(mean(durations))} · p95 ${fmtMs(p95)} · max ${fmtMs(durations.at(-1) ?? 0)}`));
	}
	const slowest = [...rows].sort((a, b) => b.duration_ms - a.duration_ms)[0];
	if (slowest) {
		const st = slowest.tokens ?? {};
		out.push("", dim("slowest ") + th.fg("warning", fmtMs(slowest.duration_ms)) + dim(` · ${slowest.model} · ${ago(slowest.timestamp)} · in ${fmtTokens((st.input_tokens ?? 0) + (st.cache_tokens ?? 0))} out ${fmtTokens(st.output_tokens ?? 0)}`));
	}
	return out;
}

/* ─────────────────────────────────────────────────────── side panel ── */

const PANEL_WIDTH = MAGI_DIAGRAM_WIDTH + 2;

class MagiPanel implements Component {
	private frame = 0;
	private timer: ReturnType<typeof setInterval> | null = null;
	/** The data rows change slowly: they are rebuilt at most twice a second, only the council animates every frame. */
	private cache: { at: number; inner: number; compact: boolean; lines: string[] } | undefined;
	/** git branch, provided by the footer (the only place pi exposes it). */
	branch?: () => string | null | undefined;
	/** When set (fullscreen column), the panel pads itself down to this many rows. */
	fillHeight?: () => number;

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

	invalidate(): void {
		this.cache = undefined;
	}

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

	private labelLine(inner: number, label: string, left: string, right: string, tone: ThemeColor): string {
		const b = (s: string) => this.theme.fg("border", s);
		const text = ` ${truncateToWidth(label, inner - 4)} `;
		const rest = Math.max(0, inner - visibleWidth(text) - 1);
		return b(left + "─") + this.theme.fg(tone, text) + b("─".repeat(rest) + right);
	}

	private sep(inner: number, label: string): string {
		return this.labelLine(inner, label, "├", "┤", "muted");
	}

	private centered(content: string, inner: number): string {
		return this.frameLine(" ".repeat(Math.max(0, Math.floor((inner - visibleWidth(content)) / 2))) + content, inner);
	}

	private field(label: string, value: string, inner: number, tone: ThemeColor = "text"): string {
		const l = this.theme.fg("dim", label.padEnd(9));
		return this.frameLine(" " + l + this.theme.fg(tone, value), inner);
	}

	/* ── the unit at work: tools ── */

	/** The session's own unit while a tool runs; berserk (and shaking) for as long as the failure flashes. */
	private mechaArt(inner: number): string[] {
		const berserk = Date.now() - state.lastFailAt < FAIL_FLASH_MS;
		const art = renderMechaHead(state.unit, berserk ? "berserk" : "active", this.frame);
		const shake = berserk ? (this.frame % 2 ? 1 : -1) : 0;
		const left = " ".repeat(Math.max(0, Math.floor((inner - MECHA_W) / 2) + shake));
		return art.map((line) => left + line);
	}

	/* ── top of the panel: the MAGI (flickering while working) or the unit (tools) ── */

	private councilSection(inner: number): string[] {
		const th = this.theme;
		const f = this.frame;
		const now = Date.now();
		const secs = (t: number) => `${secsSince(t, now)}s`;
		const pulse = animating(now) ? pulseFrames(th)[f % 6]! : th.fg("dim", "◇");

		const idle = state.phase === "idle";
		const fallen = now - state.lastFailAt < FAIL_FLASH_MS;
		let title: string;
		let titleTone: ThemeColor = "accent";
		let body: string[];
		let status: string;

		if (state.phase === "tool" || (idle && fallen)) {
			const name = MECHA[state.unit].name;
			title = fallen ? `${name} BERSERK · ${state.lastFailTool}` : `${name} · ${state.toolName || "tool"} · ${secs(state.phaseSince)}`;
			titleTone = fallen ? "error" : "warning";
			body = this.mechaArt(inner);
			const target = (fallen ? state.lastFailTarget || state.lastFailTool : state.toolTarget || state.toolName) || "tool";
			status = `${pulse} ${th.fg(fallen ? "error" : "text", truncateToWidth(target, inner - 4))}`;
		} else {
			let word: string;
			let tone: ThemeColor;
			let hub = "─MAGI─";
			let lit = (i: number) => flicker(f, i);
			let virus: Virus | undefined;
			const breathing = ["─MAGI─", "━MAGI━"][f % 2]!;

			if (state.compacting) {
				title = `COMPACTING · ${state.compactBy || "context"} · ${secs(state.compactSince)}`;
				[word, tone, hub, titleTone] = ["COMPACTING", "warning", ["─SEAL─", "━SEAL━"][f % 2]!, "warning"];
			} else if (now - state.rebornAt < REBIRTH_MS) {
				title = "SEVENTH SEAL OPENED";
				[word, tone, hub, titleTone] = ["REBORN", "success", "═MAGI═", "success"];
				lit = () => true;
			} else if (idle && (swap.state === "checking" || swap.state === "loading")) {
				title = swap.state === "loading" ? `LOADING MODEL · ${secs(swap.since)}` : "CHECKING MODEL";
				[word, tone, hub, titleTone] = ["LOADING", "accent", breathing, "warning"];
				lit = () => true;
				if (swap.state === "loading")
					virus = { infected: Math.min(1, (now - swap.since) / swap.expectedLoadMs), recovered: 0, blink: f % 4 < 2 };
			} else if (idle && swap.state === "error") {
				title = "MAGI OFFLINE";
				[word, tone, hub, titleTone] = ["OFFLINE", "error", "─ ╳ ──", "error"];
				lit = () => f % 16 < 8;
			} else if (idle && swap.state === "asleep") {
				title = "MODEL ASLEEP · type to wake";
				[word, tone, titleTone] = ["ASLEEP", "muted", "muted"];
				lit = () => false;
			} else if (idle && swap.state === "ready" && now - swap.since < ONLINE_MS) {
				title = swap.loadMs ? `MAGI ONLINE · ${fmtMs(swap.loadMs)}` : "MAGI ONLINE";
				[word, tone, hub, titleTone] = ["ONLINE", "accent", "═MAGI═", "success"];
				lit = () => true;
				virus = { infected: swap.infection, recovered: (now - swap.since) / RECOVER_MS, blink: f % 4 < 2 };
			} else if (state.phase === "thinking") {
				title = `THINKING · ${secs(state.phaseSince)}`;
				[word, tone, hub] = ["THINKING", "accent", breathing];
			} else if (state.phase === "responding") {
				const tps = liveTps();
				title = `RESPONDING${tps ? ` · ${tps.toFixed(1)} tok/s` : ""}`;
				[word, tone, hub, titleTone] = ["RESPONDING", "success", breathing, "success"];
			} else {
				title = "STANDBY";
				[word, tone, titleTone] = ["STANDBY", "muted", "muted"];
				lit = () => false;
			}

			const units = MAGI_UNITS.map((name, i) => ({ name, status: word, tone, lit: lit(i) }));
			body = magiDiagram(th, units[1]!, units[2]!, units[0]!, hub, virus);
			const c = state.lastCouncil;
			status = c
				? `${pulse} ${th.fg("dim", "COUNCIL ")}${th.fg(voteTone(c.verdict), `${c.verdict ?? "NO QUORUM"} ${c.tally}/3`)}`
				: `${pulse} ${th.fg("dim", "COUNCIL · /magi")}`;
		}

		return [this.labelLine(inner, title, "┌", "┐", titleTone), ...body.map((l) => this.frameLine(l, inner)), this.centered(status, inner)];
	}

	/* ── data rows ── */

	private sessionRows(inner: number, compact: boolean): string[] {
		const out = [this.sep(inner, "SESSION")];
		const model = liveCtx?.model;
		out.push(this.field("MODEL", truncateToWidth(model?.id ?? "—", inner - 11), inner, "text"));
		if (!compact) out.push(this.field("PROVIDER", truncateToWidth(String(model?.provider ?? "—"), inner - 11), inner, "muted"));
		out.push(this.field("THINKING", liveCtx?.thinkingLevel ?? "off", inner, "muted"));
		if (!compact) {
			const cwd = (liveCtx?.cwd ?? "").split("/").filter(Boolean).pop() ?? "—";
			out.push(this.field("PROJECT", truncateToWidth(cwd, inner - 11), inner, "muted"));
			const branch = this.branch?.();
			if (branch) out.push(this.field("BRANCH", truncateToWidth(branch, inner - 11), inner, "muted"));
		}
		return out;
	}

	private telemetryRows(inner: number, compact: boolean): string[] {
		const th = this.theme;
		const out = [this.sep(inner, "TELEMETRY")];
		if (!compact) {
			out.push(this.frameLine(` ${th.fg("dim", "TURNS".padEnd(9))}${th.fg("text", String(state.turns))}`, inner));
			out.push(
				this.frameLine(
					` ${th.fg("dim", "TOKENS".padEnd(9))}${th.fg("success", "↑" + fmtTokens(tokens.input))} ${th.fg("warning", "↓" + fmtTokens(tokens.output))}`,
					inner,
				),
			);
			if (tokens.cacheRead) out.push(this.field("CACHE", fmtTokens(tokens.cacheRead), inner, "muted"));
			if (tokens.cost) out.push(this.field("API COST", `$${tokens.cost.toFixed(3)}`, inner, "muted"));
		}

		// SYNC: the unit's sync ratio = tool success rate (CHESED ✓ / GEBURAH ✗)
		const sync = syncPercent();
		out.push(
			this.frameLine(
				sync === null
					? ` ${th.fg("dim", "SYNC".padEnd(9))}${th.fg("dim", "— no tools yet")}`
					: ` ${th.fg("dim", "SYNC".padEnd(9))}${bar(th, Math.round(sync / 10), 10, syncTone(sync))} ${th.fg(syncTone(sync), `${sync.toFixed(0)}%`)}`,
				inner,
			),
		);
		// TOOLS: CHESED (mercy) = succeeded, GEBURAH (severity) = failed
		out.push(
			this.frameLine(
				` ${th.fg("dim", "TOOLS".padEnd(7))}${th.fg("success", `✓${state.toolOk}`)}${th.fg("dim", " CHESED ")}${th.fg(state.toolFail ? "error" : "dim", `✗${state.toolFail}`)}${th.fg("dim", " GEBURAH")}`,
				inner,
			),
		);

		// SEALS: the context window, one seal per seventh
		const usage = contextUsage();
		const percent = usage?.percent ?? 0;
		const liveMark = usage?.live ? th.fg("accent", " ▲ live") : "";
		out.push(this.frameLine(` ${th.fg("dim", "SEALS".padEnd(9))}${renderSeals(th, percent)} ${th.fg(usageTone(percent), `${percent.toFixed(0)}%`)}${liveMark}`, inner));
		if (!compact && usage?.contextWindow) {
			out.push(this.field("CONTEXT", `${usage.tokens == null ? "?" : fmtTokens(usage.tokens)} / ${fmtTokens(usage.contextWindow)}`, inner, "muted"));
		}
		return out;
	}

	private performanceRows(inner: number, compact: boolean): string[] {
		const th = this.theme;
		const out = [this.sep(inner, "PERFORMANCE")];
		const live = state.phase !== "idle" && perf.chars > 0;
		// idle: prefer the value measured by llama-swap itself
		const tps = live ? liveTps() : swap.srvTps || perf.tps;
		out.push(
			this.frameLine(
				` ${th.fg("dim", "TOK/S".padEnd(9))}${th.fg(live ? "accent" : "success", tps ? tps.toFixed(1) : "—")}${live ? th.fg("dim", " ~live") : swap.srvTps ? th.fg("dim", " server") : ""}`,
				inner,
			),
		);
		if (compact) return out;
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
		return out;
	}

	/** COST: GPU energy used in the session × price per kWh set with /magi-ui config. */
	private costRow(inner: number): string {
		if (!swap.gpus.length) return this.field("COST", "—", inner, "muted");
		if (ui.kwhPrice === undefined) return this.field("COST", "→ /magi-ui config", inner, "dim");
		return this.field("COST", fmtMoney((swap.energyWh / 1000) * ui.kwhPrice), inner, "warning");
	}

	private swapRows(inner: number, compact: boolean): string[] {
		if (!swap.base) return [];
		const th = this.theme;
		const out = [this.sep(inner, "LLAMA-SWAP")];
		const st =
			swap.state === "ready"
				? th.fg("success", "IN VRAM")
				: swap.state === "asleep"
					? th.fg("muted", "ASLEEP")
					: swap.state === "error"
						? th.fg("error", "OFFLINE")
						: th.fg("warning", swap.state === "loading" ? `LOADING ${secsSince(swap.since)}s` : "CHECKING");
		const load = swap.state === "ready" && swap.loadMs ? th.fg("dim", ` load ${fmtMs(swap.loadMs)}`) : "";
		const warm =
			prewarm.state === "running"
				? th.fg("warning", " · PREWARM")
				: prewarm.state === "done"
					? th.fg("dim", ` · ${fmtTokens(prewarm.tokens)} warm`)
					: "";
		out.push(this.frameLine(` ${th.fg("dim", "STATUS".padEnd(9))}${st}${load}${warm}`, inner));
		if (compact) return [...out, this.costRow(inner)];
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
		if (swap.gpus.length) out.push(this.field("ENERGY", `${(swap.energyWh / 1000).toFixed(3)} kWh`, inner, "muted"));
		out.push(this.costRow(inner));
		return out;
	}

	render(width: number): string[] {
		const inner = Math.max(24, width - 2);
		const now = Date.now();
		if (!this.cache || this.cache.inner !== inner || this.cache.compact !== ui.compact || now - this.cache.at > 500) {
			const c = ui.compact;
			this.cache = {
				at: now,
				inner,
				compact: c,
				lines: [...this.sessionRows(inner, c), ...this.telemetryRows(inner, c), ...this.performanceRows(inner, c), ...this.swapRows(inner, c)],
			};
		}
		const bottom = this.theme.fg("border", "└" + "─".repeat(inner) + "┘");
		const lines = [...this.councilSection(inner), ...this.cache.lines];
		// fullscreen: keep the frame going down to the bottom of the terminal
		const target = (this.fillHeight?.() ?? 0) - 1;
		while (lines.length < target) lines.push(this.frameLine("", inner));
		return [...lines, bottom].map((l) => truncateToWidth(l, width));
	}
}

/* ─────────────────────────────────────────────── MAGI deliberation ── */

function voteTone(v: string | null | undefined): "success" | "warning" | "error" {
	return v === "APPROVE" ? "success" : v === "CONDITIONAL" ? "warning" : "error";
}

/**
 * Three minds, three lenses. A lens works on any subject (a nature, not a specialty), so no MAGI
 * rejects a question just because it is not "its" topic; software is where each lens gets sharpest.
 */
const MAGI = [
	{
		unit: "MELCHIOR",
		nature: "PRAGMATIST",
		persona:
			"You are MELCHIOR, the pragmatist of the MAGI council. Your lens works on any subject: what actually solves the problem " +
			"at hand, the simplest path that works, effort and cost versus value, what can be done now with what already exists, " +
			"and what is unnecessary. In software this means: reuse the current stack and existing code, avoid over-engineering, " +
			"speculative abstractions and extra dependencies, ship sooner.",
	},
	{
		unit: "BALTHASAR",
		nature: "GUARDIAN",
		persona:
			"You are BALTHASAR, the guardian of the MAGI council. Your lens works on any subject: what can go wrong, how badly and " +
			"for whom, whether the choice can be undone, which safety nets are missing, the hidden and long-term costs, and what " +
			"must be protected. In software this means: failure modes, security, data safety, operability (monitoring, rollback, " +
			"being paged at 3am), maintainability and backward compatibility.",
	},
	{
		unit: "CASPAR",
		nature: "VISIONARY",
		persona:
			"You are CASPAR, the visionary of the MAGI council. Your lens works on any subject: whether the question is framed right, " +
			"better or unconventional alternatives, the experience of the people involved, and where the choice leads over time " +
			"and what it unlocks. In software this means: design alternatives, developer and user experience, how the system " +
			"evolves over the next year. Always name at least one concrete alternative the other two would likely miss.",
	},
] as const satisfies readonly { unit: MagiUnit; nature: string; persona: string }[];

const MAGI_RULES = `You are one of the three MAGI. The council answers whatever the user asks: mostly software engineering, but not only.

Your nature is a lens, not a specialty, so competence is never a reason to reject. Whatever the subject, first work out the best answer to the question itself, then judge it through your lens. The other two MAGI cover the other lenses: stay in yours.

Be specific to this question. Every bullet must name something concrete from the question or the conversation: a tool, a number, a scenario, a step, a cost. Never write advice that would fit any question, such as "consider the trade-offs", "it depends", "ensure security" or "test properly".

How to vote:
- APPROVE: you would go ahead as asked, or you have a clear recommendation.
- CONDITIONAL: you would go ahead only if specific conditions hold, and you name them. When information is missing, vote CONDITIONAL and say exactly what you need to know and how each answer changes your recommendation.
- REJECT: your lens finds a concrete problem that makes the proposal a bad idea, and you say what to do instead. Never reject because the topic is outside software or outside your nature, or because details are missing.
For open questions (which one, how to), give your recommendation and vote on how confident you are in it.

Write in the language of the "Question for the MAGI", even though these instructions and the conversation may be in English.
Output format, no preamble:
VOTE: APPROVE | CONDITIONAL | REJECT
- first bullet: your direct answer or recommendation
- then up to 4 bullets from your lens: 5 bullets at most in total, about 120 words`;

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

/* ── config: ~/.pi/agent/magi.json → { "MELCHIOR": { "model": "provider/id", "thinking": "low" }, …, "ui": { "compact": true, "kwhPrice": 0.3 } } ── */

interface MagiUnitConfig {
	model?: string;
	thinking?: string;
}
type MagiConfig = Partial<Record<MagiUnit, MagiUnitConfig>> & {
	ui?: { compact?: boolean; kwhPrice?: number; currency?: Currency };
	loads?: Record<string, number>; // real model id → ms its last load took
};

const MAGI_CONFIG_PATH = join(homedir(), ".pi", "agent", "magi.json");

function loadMagiConfig(): MagiConfig {
	try {
		return JSON.parse(readFileSync(MAGI_CONFIG_PATH, "utf8"));
	} catch {
		return {};
	}
}

function saveMagiConfig(cfg: MagiConfig): void {
	writeFileSync(MAGI_CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
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

const REVIEW_MAX_CHARS = 24_000;

/** The pending changes for /magi review: tracked changes against HEAD plus the names of untracked files. */
async function pendingChanges(cwd: string): Promise<{ diff: string; untracked: string[] }> {
	const git = (args: string[]) => promisify(execFile)("git", args, { cwd, maxBuffer: 32 * 1024 * 1024 }).then((r) => r.stdout);
	let diff: string;
	try {
		diff = await git(["diff", "HEAD"]);
	} catch {
		// no commits yet: staged + unstaged
		diff = (await git(["diff", "--cached"])) + (await git(["diff"]));
	}
	const untracked = (await git(["ls-files", "--others", "--exclude-standard"]).catch(() => "")).split("\n").filter(Boolean);
	return { diff, untracked };
}

/** Common function words per language, used to name the reply language explicitly. */
const LANGUAGE_HINTS: readonly [string, readonly string[]][] = [
	["Italian", ["il", "lo", "la", "gli", "di", "che", "per", "non", "una", "con", "sono", "come", "perché", "è", "dovrei", "meglio", "mettiamo", "questo", "quale"]],
	["Spanish", ["el", "los", "las", "que", "para", "por", "es", "cómo", "debería", "mejor", "este", "cuál"]],
	["French", ["le", "les", "des", "est", "pour", "avec", "dois", "comment", "mieux", "ce", "quel"]],
	["German", ["der", "die", "das", "und", "ist", "nicht", "für", "mit", "ich", "soll", "wie", "besser"]],
	["English", ["the", "is", "should", "we", "for", "with", "and", "to", "of", "how", "which", "better"]],
];

/**
 * Guesses the question's language from function words; undefined when unsure.
 * ponytail: stopword heuristic for five languages, swap in a real detector if other languages matter.
 */
function guessLanguage(text: string): string | undefined {
	const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
	const scores = LANGUAGE_HINTS.map(([lang, hints]) => [lang, words.filter((w) => hints.includes(w)).length] as const).sort(
		(a, b) => b[1] - a[1],
	);
	const [best, second] = scores;
	return best![1] >= 2 && best![1] > second![1] ? best![0] : undefined;
}

/** The user message each MAGI receives. The language reminder sits after the question, where the model reads it last. */
function councilPrompt(project: string, context: string, question: string, contextLabel = "Recent conversation (context only, may be empty)"): string {
	const lang = guessLanguage(question);
	const reminder = lang
		? `(Write your whole answer in ${lang}, even if technical terms in the question are English.)`
		: "(Write your whole answer in the language of this question, even if technical terms in it are English.)";
	return (
		`Project: ${project}\n\n${contextLabel}:\n<context>\n${context}\n</context>\n\n` +
		`Question for the MAGI:\n${question}\n\n${reminder}`
	);
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

			// Pending units flicker at random until their model answers.
			const units: UnitView[] = MAGI_UNITS.map((name, i) => {
				const o = opinions[i];
				if (!o) return { name, status: "···", tone: "accent", lit: flicker(tick, i) };
				if (!o.vote) return { name, status: "ERROR", tone: "error", lit: true };
				return { name, status: o.vote === "CONDITIONAL" ? "COND." : o.vote, tone: voteTone(o.vote), lit: true };
			});
			const { verdict, tally } = tallyVerdict(opinions.map((o) => o?.vote ?? null));
			const hub = done ? "◆MAGI◆" : ["─MAGI─", "━MAGI━"][tick % 2]!;
			const left = " ".repeat(Math.max(0, Math.floor((inner - MAGI_DIAGRAM_WIDTH) / 2)));
			for (const l of magiDiagram(theme, units[1]!, units[2]!, units[0]!, hub)) out.push(row(left + l));

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

/** A read-only boxed report (used by /magi-ui status); any key closes it. */
function buildReportView(theme: Theme, lines: string[], close: () => void) {
	return {
		render(width: number): string[] {
			const inner = Math.max(40, Math.min(width - 2, 96));
			const row = (s: string) => {
				const t = truncateToWidth(" " + s, inner);
				return theme.fg("accent", "│") + t + " ".repeat(Math.max(0, inner - visibleWidth(t))) + theme.fg("accent", "│");
			};
			return [
				theme.fg("accent", "┌" + "─".repeat(inner) + "┐"),
				...lines.map(row),
				theme.fg("accent", "└" + "─".repeat(inner) + "┘"),
				theme.fg("dim", " any key: close"),
			].map((l) => truncateToWidth(l, width));
		},
		handleInput(_data: string) {
			close();
		},
		invalidate() {},
	};
}

interface MechaEntry {
	model: Model<any>;
	unit: MechaUnit;
	state: MechaState;
}

/** MECHA SELECT: the model picker of a new session. The highlighted unit's head is animated by its real state in llama-swap. */
function buildMechaPicker(tui: TUI, theme: Theme, entries: MechaEntry[], start: number, close: (picked: MechaEntry | undefined) => void) {
	let frame = 0;
	let index = start;
	const timer = setInterval(() => {
		frame++;
		tui.requestRender();
	}, 125);
	const nameWidth = Math.max(...entries.map((e) => visibleWidth(e.model.id)));

	return {
		render(width: number): string[] {
			const dim = (s: string) => theme.fg("dim", s);
			const inner = Math.max(40, Math.min(width - 2, 96));
			const row = (s: string) => {
				const t = truncateToWidth(s, inner);
				return theme.fg("accent", "║") + t + " ".repeat(Math.max(0, inner - visibleWidth(t))) + theme.fg("accent", "║");
			};
			const sel = entries[index]!;
			const head = renderMechaHead(sel.unit, sel.state, frame);
			const list = entries.map((e, i) => {
				const u = MECHA[e.unit];
				const mark = i === index ? theme.fg("accent", "▸ ") : "  ";
				const unit = rgb(e.state === "dormant" ? shade(u.armor, 0.6) : u.armor, u.name.padEnd(10));
				const name = i === index ? theme.bold(theme.fg("text", e.model.id)) : theme.fg("muted", e.model.id);
				const status =
					e.state === "active" ? theme.fg("success", "● IN VRAM") : e.state === "waking" ? theme.fg("warning", "◌ WAKING") : dim("○ dormant");
				return mark + unit + name + " ".repeat(nameWidth - visibleWidth(e.model.id) + 2) + status;
			});
			const u = MECHA[sel.unit];
			const sync =
				sel.state === "active"
					? theme.fg("success", `${u.name} · SYNC READY · no wait`)
					: sel.state === "waking"
						? theme.fg("warning", `${u.name} · LIFT OFF`)
						: theme.fg("muted", `${u.name} · DORMANT · it will be loaded into VRAM`);

			const out = [
				theme.fg("accent", "╔" + "═".repeat(inner) + "╗"),
				row(theme.bold(theme.fg("accent", " MECHA SELECT")) + dim(" :: choose the unit to activate")),
				theme.fg("accent", "╟" + "─".repeat(inner) + "╢"),
			];
			for (let r = 0; r < Math.max(head.length, list.length); r++) out.push(row(` ${head[r] ?? " ".repeat(13)}  ${list[r] ?? ""}`));
			out.push(theme.fg("accent", "╟" + "─".repeat(inner) + "╢"), row(" " + sync), theme.fg("accent", "╚" + "═".repeat(inner) + "╝"));
			out.push(dim(" ↑↓ select · enter: activate · esc: keep the current model, it loads when you type"));
			return out.map((l) => truncateToWidth(l, width));
		},
		handleInput(data: string) {
			if (matchesKey(data, "up")) index = (index + entries.length - 1) % entries.length;
			else if (matchesKey(data, "down")) index = (index + 1) % entries.length;
			else if (matchesKey(data, "enter")) close(entries[index]);
			else if (matchesKey(data, "escape")) close(undefined);
			tui.requestRender();
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
	saveMagiConfig(cfg);
	ctx.ui.notify(`MAGI config saved to ${MAGI_CONFIG_PATH}`, "info");
}

/* ──────────────────────────────────────────────────────────── footer ── */

/**
 * The footer's left side, one animation per real state of the agent:
 *  - seals breaking / seventh seal opened → context compaction
 *  - unit in sync / berserk               → tool running (with its file or command) / tool failed
 *  - light pulsing in the upper triad     → thinking
 *  - light descending to Malkuth          → streaming the answer
 *  - light ascending from Malkuth         → loading the model into VRAM
 *  - the sixth seal                       → context close to compaction
 *  - asleep / at rest in Malkuth          → model unloaded / idle
 */
function footerLeft(th: Theme, now = Date.now()): string {
	const dim = (s: string) => th.fg("dim", s);
	const step = Math.floor(now / ANIM_STEP_MS);
	const slowStep = Math.floor(now / SEPHIRAH_STEP_MS);
	const lights = (fn: (i: number) => NodeLight) => SEPHIROT.map((_, i) => fn(i));

	if (state.compacting) {
		const broken = step % 8;
		return (
			th.fg("warning", "✶ ") +
			th.fg("warning", "◉".repeat(broken)) +
			dim("○".repeat(7 - broken)) +
			th.fg("warning", " BREAKING THE SEALS") +
			dim(" · ") +
			th.fg("text", state.compactBy || "compacting") +
			dim(` · ${secsSince(state.compactSince, now)}s`)
		);
	}
	if (now - state.rebornAt < REBIRTH_MS) {
		return (
			th.fg("success", "✶ ") +
			renderPath(th, lights(() => (step % 2 ? "on" : "hot"))) +
			th.fg("success", " SEVENTH SEAL OPENED") +
			dim(` · context compacted by ${state.compactBy || "pi"}, the world is remade`)
		);
	}
	if (state.phase === "tool" || now - state.lastFailAt < FAIL_FLASH_MS) {
		const sync = syncPercent();
		const tally = th.fg("success", ` CHESED ✓${state.toolOk}`) + th.fg(state.toolFail ? "error" : "dim", ` GEBURAH ✗${state.toolFail}`);
		const syncText = sync === null ? "" : dim(" · sync ") + th.fg(syncTone(sync), `${sync.toFixed(0)}%`);
		if (now - state.lastFailAt < FAIL_FLASH_MS) {
			const target = state.lastFailTarget ? dim(" ") + th.fg("error", truncateToWidth(state.lastFailTarget, 40)) : "";
			return (
				th.fg("error", `✗ ${MECHA[state.unit].name} · `) +
				th.bold(th.fg("error", "BERSERK")) +
				dim(" · ") +
				th.fg("error", `${state.lastFailTool} failed`) +
				target +
				dim(" ·") +
				tally +
				syncText
			);
		}
		const roar = ["▚", "▞"][step % 2]!;
		const target = state.toolTarget ? dim(" ") + th.fg("muted", truncateToWidth(state.toolTarget, 40)) : "";
		return (
			th.fg("accent", `${roar} ${MECHA[state.unit].name} · `) +
			th.bold(th.fg("warning", "SYNC")) +
			dim(" · ") +
			th.fg("text", state.toolName || "tool") +
			target +
			dim(` ${secsSince(state.phaseSince, now)}s ·`) +
			tally +
			syncText
		);
	}
	if (state.phase === "thinking") {
		const cur = slowStep % 3; // Keter, Chokmah, Binah
		const s = SEPHIROT[cur]!;
		return (
			th.fg("accent", "◆ ") +
			renderPath(th, lights((i) => (i === cur ? "hot" : i < 3 ? "on" : "off"))) +
			th.fg("warning", ` ${s.name}`) +
			dim(` · ${s.meaning} · thinking ${secsSince(state.phaseSince, now)}s`)
		);
	}
	if (state.phase === "responding") {
		const cur = 5 + (slowStep % 5); // Tiferet → Malkuth
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
	const percent = contextUsage()?.percent ?? 0;
	if (percent >= SIXTH_SEAL_PERCENT) {
		const cmd = state.hasSmartCompact ? "/smart-compact" : "/compact";
		return (
			th.fg(step % 4 < 2 ? "error" : "warning", "⚠ SIXTH SEAL") +
			dim(` · context ${percent.toFixed(0)}% · compact now with `) +
			th.fg("text", cmd) +
			dim(" before it happens mid-task")
		);
	}
	if (swap.state === "asleep") {
		return th.fg("muted", "○ MALKUTH") + dim(" · model asleep in llama-swap · type to wake it");
	}
	const last = state.lastRunMs ? ` · last run ${fmtMs(state.lastRunMs)}` : "";
	return th.fg("success", "○ ") + th.fg("muted", "MALKUTH") + dim(` · the kingdom · at rest${last}`);
}

/** Footer: the animation on the left, other extensions' statuses on the right. */
function buildFooter(tui: TUI, theme: Theme, footerData: any) {
	let scrolling = false;
	let scrollOff = 0;
	let scrollPeriod = 1;
	let scrollLine = "";
	const timer = setInterval(() => {
		if (animating()) tui.requestRender();
	}, ANIM_STEP_MS);
	// The marquee keeps its own cadence: one cell per tick, never derived from the clock, so it
	// does not stutter when the line is re-rendered at some other pace (animation, streamed tokens)
	// nor jump when the left side changes length (sephirah name, tok/s) and with it the loop period.
	const scrollTimer = setInterval(() => {
		if (!scrolling) return;
		scrollOff = (scrollOff + 1) % scrollPeriod;
		tui.requestRender();
	}, FOOTER_SCROLL_MS);

	const unsub = footerData?.onBranchChange?.(() => tui.requestRender());

	return {
		render(width: number): string[] {
			const dim = (s: string) => theme.fg("dim", s);
			const statuses = footerData?.getExtensionStatuses?.();
			const right = statuses ? [...statuses.values()].filter(Boolean).join(dim(" │ ")) : "";
			const left = footerLeft(theme);
			const gap = width - visibleWidth(left) - visibleWidth(right);
			scrolling = gap < 1;
			if (!scrolling) {
				scrollLine = "";
				scrollOff = 0;
				return [left + " ".repeat(gap) + right];
			}
			// Too narrow to fit: scroll the whole line instead of cutting it off. The line is frozen
			// while it scrolls — live text changes width (seconds, tok/s, sephirah names) and every
			// change would shift it under the window. A fresh line is taken when it has the same
			// width, so nothing moves, otherwise at the end of the loop.
			const line = left + dim(FOOTER_SCROLL_GAP) + right + dim(FOOTER_SCROLL_GAP);
			const period = Math.max(1, visibleWidth(line));
			if (!scrollLine || scrollOff === 0 || period === scrollPeriod) {
				scrollLine = line;
				scrollPeriod = period;
			}
			return [sliceByColumn(scrollLine + scrollLine, scrollOff % scrollPeriod, width, true)];
		},
		invalidate() {},
		dispose() {
			clearInterval(timer);
			clearInterval(scrollTimer);
			unsub?.();
		},
	};
}

/* ───────────────────────────────────────────────────────── extension ── */

const BUSY_POLL_MS = 3_000;
const IDLE_POLL_MS = 30_000;
/** pi rewrites the window title on its own (right after startup, on session info changes), so ours is re-applied. */
const TITLE_REFRESH_MS = 2_000;

/** Window title: "π - Magi - <working directory>", prefixed with ✓ after a long run until you are back. */
function windowTitle(cwd: string, done = false): string {
	const home = homedir();
	const dir = cwd.startsWith(home) ? "~" + cwd.slice(home.length) : cwd;
	return `${done ? "✓ " : ""}π - Magi - ${dir}`;
}

export default function (pi: ExtensionAPI) {
	let chrome = true;
	let panelEnabled = true;
	let tuiRef: TUI | undefined;
	let panelHandle: OverlayHandle | undefined;
	let panel: MagiPanel | undefined;
	let titleDone = false;

	const repaint = () => {
		panel?.invalidate();
		tuiRef?.requestRender();
	};

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
			panel.fillHeight = () => process.stdout.rows ?? 0;
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
		ctx.ui.setTitle(windowTitle(ctx.cwd, titleDone));
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
	let unsubscribeInput: (() => void) | undefined;
	let lastPoll = 0;
	let titleTimer: ReturnType<typeof setInterval> | undefined;
	let liveTimer: ReturnType<typeof setInterval> | undefined;
	/** Tools currently executing, by call id: the unit shows one of them, and leaves when none is left. */
	const runningTools = new Map<string, { name: string; target: string }>();

	/** The picker has the keyboard: keys pressed there must not wake the default model. */
	let pickerOpen = false;

	/** MECHA SELECT on a new llama-swap session: nothing goes into VRAM until a unit is chosen. */
	const pickModel = async (ctx: ExtensionContext) => {
		const current = ctx.model!;
		const models = ctx.modelRegistry.getAvailable().filter((m) => m.provider === "llama-swap");
		if (models.length < 2) return;
		pickerOpen = true;
		try {
			const [aliases, running] = await Promise.all([swapAliases(), swapRunning()]);
			const realOf = (m: Model<any>) => aliases.get(m.id) ?? m.id;
			const units = mechaUnitsOf(ctx, aliases);
			const rank: MechaUnit[] = ["I", "II", "III", "LEGION"];
			const entries: MechaEntry[] = models
				.map((model) => {
					const st = running.get(realOf(model));
					const mechaState: MechaState = st === "ready" ? "active" : st === "starting" ? "waking" : "dormant";
					return { model, unit: units.get(realOf(model))!, state: mechaState };
				})
				.sort((a, b) => rank.indexOf(a.unit) - rank.indexOf(b.unit));
			// the session's model if it is in VRAM, else any unit already in VRAM (no wait), else the session's model
			const own = entries.findIndex((e) => e.model.id === current.id);
			let start = entries[own]?.state === "active" ? own : entries.findIndex((e) => e.state === "active");
			if (start < 0) start = Math.max(0, own);

			const picked = await ctx.ui.custom<MechaEntry | undefined>((tui, theme, _keys, done) => buildMechaPicker(tui, theme, entries, start, done));
			if (!picked) return;
			// same model: pi emits no model_select, so load it here
			if (picked.model.id === current.id) return void preloadModel(ctx, picked.model);
			if (!(await pi.setModel(picked.model))) ctx.ui.notify(`${picked.model.id}: no credentials for llama-swap`, "error");
		} finally {
			pickerOpen = false;
		}
	};

	/** Which unit acts in the panel: the one the picker gave this session's model. LEGION for anything not llama-swap. */
	const refreshUnit = async (ctx: ExtensionContext, model: Model<any> | undefined = ctx.model) => {
		if (!model) return;
		try {
			const aliases = await swapAliases();
			state.unit = mechaUnitsOf(ctx, aliases).get(aliases.get(model.id) ?? model.id) ?? "LEGION";
		} catch {
			state.unit = "LEGION"; // llama-swap unreachable: no roster, so the unit is nameless
		}
	};

	pi.on("session_start", async (event, ctx) => {
		liveCtx = ctx;
		void refreshUnit(ctx);
		recountSession(ctx);
		state.hasSmartCompact = pi.getCommands().some((c) => c.name.replace(/^\//, "") === "smart-compact");
		const cfg = loadMagiConfig();
		ui.compact = cfg.ui?.compact ?? false;
		ui.kwhPrice = cfg.ui?.kwhPrice;
		ui.currency = cfg.ui?.currency === "USD" ? "USD" : "EUR";
		if (ctx.mode !== "tui") return;
		applyChrome(ctx);
		// nothing is loaded at startup: a new session picks its MECHA unit, a resumed one shows whether its model is in VRAM
		const fresh = event.reason === "new" || (event.reason === "startup" && !ctx.sessionManager.getBranch().some((e) => e.type === "message"));
		void probeModel(ctx).then(() => (fresh && chrome && swap.base ? pickModel(ctx) : undefined));
		// GPU stats every 3s while something happens, every 30s when idle
		metricsTimer ??= setInterval(() => {
			const now = Date.now();
			if (!animating(now) && now - lastPoll < IDLE_POLL_MS) return;
			lastPoll = now;
			void refreshSwapMetrics()
				.then(refreshSwapRunning)
				.then(repaint);
		}, BUSY_POLL_MS);
		metricsTimer.unref?.();
		// the seals follow the context live while the model works
		liveTimer ??= setInterval(() => {
			if (state.phase !== "idle") void refreshLiveContext().then(repaint);
		}, LIVE_POLL_MS);
		liveTimer.unref?.();
		// back at the keyboard: clear the ✓ from the title, wake a model llama-swap unloaded
		unsubscribeInput ??= ctx.ui.onTerminalInput(() => {
			if (titleDone) {
				titleDone = false;
				ctx.ui.setTitle(windowTitle(ctx.cwd));
			}
			if (swap.state === "asleep" && liveCtx && !pickerOpen) void preloadModel(liveCtx);
			return undefined;
		});
		// ponytail: re-applies the title every 2s because pi overwrites it without telling extensions
		titleTimer ??= setInterval(() => {
			if (chrome) ctx.ui.setTitle(windowTitle(ctx.cwd, titleDone));
		}, TITLE_REFRESH_MS);
		titleTimer.unref?.();
	});

	pi.on("session_tree", async (_event, ctx) => {
		liveCtx = ctx;
		recountSession(ctx);
		repaint();
	});

	pi.on("before_provider_request", (event, ctx) => {
		rememberPrefix(ctx.cwd, event.payload);
	});

	pi.on("model_select", async (event, ctx) => {
		liveCtx = ctx;
		void refreshUnit(ctx, event.model);
		if (ctx.mode === "tui") void preloadModel(ctx, event.model);
	});

	pi.on("session_shutdown", async () => {
		prewarm.abort?.abort();
		clearInterval(metricsTimer);
		metricsTimer = undefined;
		unsubscribeInput?.();
		unsubscribeInput = undefined;
		clearInterval(titleTimer);
		titleTimer = undefined;
		clearInterval(liveTimer);
		liveTimer = undefined;
		hidePanel();
	});

	pi.on("agent_start", async () => {
		state.runStart = Date.now();
	});

	pi.on("turn_start", async (_event, ctx) => {
		liveCtx = ctx;
		prewarm.abort?.abort();
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
		else if (t === "toolcall_start" || t === "toolcall_delta") {
			// the model is writing a tool call: the unit shows which tool it prepares, not the previous one
			setPhase("tool");
			const call = e.partial?.content?.[e.contentIndex];
			if (call?.type === "toolCall") {
				state.toolName = call.name ?? "";
				state.toolTarget = toolTarget(call.arguments);
			}
		}
		if (typeof e?.delta === "string" && e.delta) {
			if (!perf.first) perf.first = Date.now();
			perf.chars += e.delta.length;
		}
	});

	pi.on("message_end", async (event) => {
		if (event.message.role !== "assistant") return;
		const m = event.message as AssistantMessage;
		addUsage(m);
		if (perf.start) {
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
		}
		repaint();
		// llama-swap records the request once it completes
		setTimeout(() => void refreshSwapActivity().then(repaint), 300);
	});

	pi.on("tool_execution_start", async (event, ctx) => {
		liveCtx = ctx;
		const tool = { name: event.toolName ?? "", target: toolTarget(event.args) };
		runningTools.set(event.toolCallId, tool);
		setPhase("tool");
		state.toolName = tool.name;
		state.toolTarget = tool.target;
		repaint();
	});

	// CHESED (mercy) counts what worked, GEBURAH (severity) what failed; a failure throws the unit berserk.
	pi.on("tool_execution_end", async (event) => {
		const tool = runningTools.get(event.toolCallId);
		runningTools.delete(event.toolCallId);
		if (event.isError) {
			state.toolFail++;
			state.lastFailAt = Date.now();
			state.lastFailTool = event.toolName ?? tool?.name ?? "tool";
			state.lastFailTarget = tool?.target ?? "";
		} else {
			state.toolOk++;
		}
		const next = [...runningTools.values()][0];
		if (next) {
			// parallel tools: the unit moves on to one still running
			state.toolName = next.name;
			state.toolTarget = next.target;
		} else {
			// all tools done: the model now reads their results and thinks about the next step
			setPhase("thinking");
			state.toolName = "";
			state.toolTarget = "";
		}
		repaint();
	});

	pi.on("agent_settled", async (_event, ctx) => {
		liveCtx = ctx;
		if (state.runStart) state.lastRunMs = Date.now() - state.runStart;
		state.runStart = 0;
		setPhase("idle");
		runningTools.clear();
		state.toolName = "";
		state.toolTarget = "";
		if (ctx.mode === "tui" && chrome) {
			ctx.ui.setWorkingMessage();
			// a long run just finished: mark the window title until you touch the keyboard
			if (state.lastRunMs > DONE_TITLE_AFTER_MS) {
				titleDone = true;
				ctx.ui.setTitle(windowTitle(ctx.cwd, true));
			}
		}
		repaint();
	});

	// The seven seals: compaction breaks them, and the context is reborn.
	// When pi-smart-compact is installed it owns the compaction; this theme only watches and names it.
	pi.on("session_before_compact", async () => {
		state.compacting = true;
		state.compactSince = Date.now();
		state.compactBy = state.hasSmartCompact ? "smart-compact" : "pi native";
		repaint();
	});

	pi.on("session_compact", async (event) => {
		state.compacting = false;
		state.rebornAt = Date.now();
		// fromExtension: an extension supplied the summary; otherwise pi's own compactor did (e.g. smart-compact fell back)
		state.compactBy = event.fromExtension ? (state.hasSmartCompact ? "smart-compact" : "extension") : "pi native";
		repaint();
	});

	pi.on("session_compact_failed", async () => {
		state.compacting = false;
		repaint();
	});

	/** Runs the council on a question with some context, shows the deliberation, stores the verdict. */
	async function runCouncil(ctx: ExtensionContext, question: string, context: string, contextLabel?: string): Promise<void> {
		const cfg = loadMagiConfig();
		const project = (ctx.cwd ?? "").split("/").filter(Boolean).pop() ?? "";
		const prompt = councilPrompt(project, context, question, contextLabel);

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
		state.lastCouncil = { verdict, tally, question };
		repaint();
	}

	pi.registerCommand("magi", {
		description: "Ask the three MAGI (pragmatist, guardian, visionary); /magi review [focus] judges the git diff; /magi config assigns models; /magi mecha picks the model",
		handler: async (args, ctx) => {
			const arg = args.trim();
			if (arg === "config") return configureMagi(ctx);
			if (arg === "mecha") {
				if (ctx.mode !== "tui" || !swap.base) return ctx.ui.notify("MECHA SELECT needs the TUI and a llama-swap model", "error");
				liveCtx = ctx;
				return pickModel(ctx);
			}

			if (arg === "review" || arg.startsWith("review ")) {
				const focus = arg.slice("review".length).trim();
				let changes: { diff: string; untracked: string[] };
				try {
					changes = await pendingChanges(ctx.cwd);
				} catch {
					ctx.ui.notify("MAGI review needs a git repository", "error");
					return;
				}
				if (!changes.diff.trim() && !changes.untracked.length) {
					ctx.ui.notify("Nothing to review: no changes against HEAD", "info");
					return;
				}
				const diff =
					changes.diff.length > REVIEW_MAX_CHARS
						? changes.diff.slice(0, REVIEW_MAX_CHARS) + `\n… diff truncated (${changes.diff.length} chars in total)`
						: changes.diff;
				const untracked = changes.untracked.length ? `\n\nUntracked files (content not shown):\n${changes.untracked.join("\n")}` : "";
				const question = focus
					? `Review these pending changes before committing, focusing on: ${focus}`
					: "Review these pending changes before committing: are they ready to commit, and what must change first?";
				return runCouncil(ctx, question, "```diff\n" + diff + "\n```" + untracked, "Pending changes (git diff HEAD)");
			}

			const question = arg || (await ctx.ui.input("Question for the MAGI:", "should we …?"))?.trim() || "";
			if (!question) return;
			return runCouncil(ctx, question, conversationExcerpt(ctx));
		},
	});

	pi.registerCommand("magi-ui", {
		description: "MAGI chrome: enable the theme, or manage it (on|off|panel|compact|status|config)",
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
			if (arg === "compact") {
				ui.compact = !ui.compact;
				const cfg = loadMagiConfig();
				saveMagiConfig({ ...cfg, ui: { ...cfg.ui, compact: ui.compact } });
				repaint();
				ctx.ui.notify(`Side panel ${ui.compact ? "compact" : "detailed"}`, "info");
				return;
			}
			if (arg === "config") {
				const currency = await ctx.ui.select(`Currency for COST (current: ${ui.currency})`, ["EUR", "USD"]);
				if (!currency) return;
				const current = ui.kwhPrice !== undefined ? ` (current: ${ui.kwhPrice})` : "";
				const raw = (await ctx.ui.input(`Electricity price per kWh in ${currency}${current}:`, "0.30"))?.trim();
				if (raw === undefined) return;
				const price = raw === "" && ui.kwhPrice !== undefined ? ui.kwhPrice : Number(raw.replace(",", "."));
				if (raw === "" && ui.kwhPrice === undefined) {
					ctx.ui.notify("No price entered: COST unchanged", "warning");
					return;
				}
				if (!Number.isFinite(price) || price < 0) {
					ctx.ui.notify(`Invalid price: "${raw}"`, "error");
					return;
				}
				ui.currency = currency === "USD" ? "USD" : "EUR";
				ui.kwhPrice = price;
				const cfg = loadMagiConfig();
				saveMagiConfig({ ...cfg, ui: { ...cfg.ui, currency: ui.currency, kwhPrice: price } });
				repaint();
				ctx.ui.notify(`COST: ${fmtMoney(price)} per kWh`, "info");
				return;
			}
			if (arg === "status") {
				if (!swap.base) {
					ctx.ui.notify("/magi-ui status needs a llama-swap session model", "warning");
					return;
				}
				let report: { data?: ActivityRow[]; total?: number };
				try {
					report = (await (await swapGet(`/api/metrics/activity?limit=${ACTIVITY_REPORT_ROWS}`, 15_000)).json()) as typeof report;
				} catch (err) {
					ctx.ui.notify(`llama-swap status failed: ${err instanceof Error ? err.message : String(err)}`, "error");
					return;
				}
				const rows = report.data ?? [];
				if (!rows.length) {
					ctx.ui.notify("llama-swap has no recorded requests yet", "info");
					return;
				}
				await ctx.ui.custom<void>((_tui, theme, _keys, done) =>
					buildReportView(theme, activityReport(theme, rows, report.total ?? rows.length), () => done(undefined)),
				);
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
			ctx.ui.notify("MAGI online — /magi-ui panel|compact|status|off", "info");
		},
	});
}
