/**
 * SIMULATION and LIFT-OFF: a long task split for local models.
 * SIMULATION (/magi plan): an interactive session that may only write PLAN.md and NOTES.md.
 * LIFT-OFF (/magi execute): one fresh session per unticked step; MAGI runs the step's verify command,
 * ticks it and commits. The task state lives on disk, never in a context window.
 */

export const PLAN_FILE = "PLAN.md";
export const NOTES_FILE = "NOTES.md";

/** The sections of NOTES.md: SIMULATION writes them, every LIFT-OFF adds to them. */
export const NOTES_TEMPLATE = `## Key files
## Commands that work
## Decisions
## Pitfalls`;

export type PlanStep = { line: number; done: boolean; text: string; verify?: string; do?: string; files?: string[]; accept?: string };

const STEP = /^\s*[-*] \[([ xX])\] (.+)$/;
const VERIFY = /\s*[—–-]+\s*verify:\s*`([^`]+)`\s*$/i;
const FIELD = /^\s+[-*] (do|files|accept|verify):\s*(.*)$/i;

/** The standard step: a checkbox line, then its fields as indented bullets. */
export const STEP_TEMPLATE = `- [ ] <n>. <short title>
  - do: <what to build, concrete: names, numbers, where in the code>
  - files: <comma-separated paths or directories the step must change>
  - accept: <measurable criteria (a), (b), …: behaviour and numbers, never "the code mentions X">
  - verify: \`<shell command that exits 0 only when every accept criterion holds>\``;

/** The checklist in PLAN.md: a step line (`- [ ] title`, verify inline or as a field) and its indented fields. */
export function parsePlan(md: string): PlanStep[] {
	const steps: PlanStep[] = [];
	md.split("\n").forEach((raw, line) => {
		const m = STEP.exec(raw);
		if (m) {
			const v = VERIFY.exec(m[2]!);
			steps.push({ line, done: m[1] !== " ", text: (v ? m[2]!.slice(0, v.index) : m[2]!).trim(), verify: v?.[1]!.trim() });
			return;
		}
		const f = FIELD.exec(raw);
		const step = steps.at(-1);
		if (!f || !step) return;
		const key = f[1]!.toLowerCase(), value = f[2]!.trim();
		if (key === "verify") step.verify = /^`([^`]+)`$/.exec(value)?.[1]!.trim() ?? value;
		else if (key === "files") step.files = value.split(",").map((x) => x.trim().replace(/^`|`$/g, "")).filter(Boolean);
		else step[key as "do" | "accept"] = value;
	});
	return steps;
}

/** Whether a changed path is one of the step's files, or inside one of its directories. */
export function touches(changed: string[], files: string[]): boolean {
	const norm = (p: string) => p.replace(/^\.\//, "").replace(/\/$/, "");
	return changed.some((c) => files.some((f) => norm(c) === norm(f) || norm(c).startsWith(norm(f) + "/")));
}

/** Paths in `git status --porcelain` output (the new path of a rename). */
export function changedPaths(porcelain: string): string[] {
	return porcelain.split("\n").filter((l) => l.trim()).map((l) => l.slice(3).split(" -> ").at(-1)!.replace(/^"|"$/g, ""));
}

/** PLAN.md with the step ticked, or undefined when the step is no longer there. */
export function tickStep(md: string, text: string): string | undefined {
	const lines = md.split("\n");
	const step = parsePlan(md).find((s) => s.text === text);
	if (!step) return undefined;
	lines[step.line] = lines[step.line]!.replace(/\[[ xX]\]/, "[x]");
	return lines.join("\n");
}

/** Why the plan cannot lift off, or undefined when it can. */
export function planProblem(steps: PlanStep[]): string | undefined {
	if (!steps.length) return `${PLAN_FILE} has no checklist: write steps as "- [ ] step — verify: \`command\`"`;
	if (steps.every((s) => s.done)) return `every step in ${PLAN_FILE} is already ticked`;
	for (const s of steps.filter((s) => !s.done)) {
		if (!s.verify) return `step without a verify command: "${s.text}"`;
		if (/^\s*(true|:|exit 0|echo\b[^|&;]*)\s*$/.test(s.verify)) return `step with a verify that cannot fail: "${s.text}"`;
		if (!s.accept) return `step without accept criteria: "${s.text}"`;
		if (!s.files?.length) return `step without files: "${s.text}"`;
	}
	return undefined;
}

/** ■ done, ▶ current (✗ when its verification failed), □ waiting. */
export function progressBar(total: number, current: number, failed = false): string {
	return Array.from({ length: total }, (_, i) => (i < current ? "■" : i === current ? (failed ? "✗" : "▶") : "□")).join("");
}

export function simulationPrompt(goal: string): string {
	return `SIMULATION: plan only. Goal: ${goal}

Explore the code and discuss the approach with the user. Do not change any file except ${PLAN_FILE} and ${NOTES_FILE}: other writes are blocked.
Write ${PLAN_FILE} as a checklist, in execution order, every step in exactly this form (all four fields are required):
${STEP_TEMPLATE}
Each step runs later in a fresh session that knows only ${PLAN_FILE}, ${NOTES_FILE} and the code, and MAGI checks it mechanically, so:
- keep each step small enough for one short session;
- the verify must FAIL before the step is done: MAGI runs it first and refuses a step whose verify is already green;
- the verify measures behaviour (tests, numbers, rendered output), compares cases (with/without, calm/storm) instead of one loose absolute threshold, and never greps the source for a word;
- when the verify is a test the step itself writes (e.g. \`--selftest=name\`), the accept criteria fix exactly what it must assert, with numbers;
- after the step MAGI also requires a change in its files, re-runs the verify of every earlier step, and the council audits the diff against the accept criteria;
- put everything the executor must know in ${NOTES_FILE}, short bullets under these headings:
${NOTES_TEMPLATE}
When the plan is ready, ask the user to review it and start it with /magi execute.`;
}

export function liftOffPrompt(step: PlanStep, n: number, total: number, failure?: string): string {
	const retry = failure
		? `\n\nThe previous attempt at this step failed its verification. Output:\n\`\`\`\n${failure}\n\`\`\`\nFix the cause.`
		: "";
	return `LIFT-OFF ${n}/${total}. You run ONE step of ${PLAN_FILE}, in a fresh session.
Read ${NOTES_FILE} and ${PLAN_FILE} first. Your step:
${step.text}
- do: ${step.do ?? "(see the step)"}
- files: ${step.files?.join(", ") ?? "(see the step)"}
- accept: ${step.accept ?? "(see the step)"}

It is verified with \`${step.verify}\`: run it yourself before you finish.
Do only this step. Do not change ${PLAN_FILE}, do not tick it and do not commit: MAGI does that after its own checks.
MAGI checks, not your words: it runs the verify, requires a change in the step's files, re-runs the verify of every earlier step, and the council audits your diff against the accept criteria. A test that passes without measuring (a hardcoded OK, a weakened threshold, a skipped assertion) is rejected. If you cannot finish, say so plainly and write what is missing in ${NOTES_FILE}.
Before you finish, add to ${NOTES_FILE}, as short bullets under its headings (Key files, Commands that work, Decisions, Pitfalls), what the next steps need to know.${retry}`;
}

/** The diff as the audit council reads it: fenced, cut at maxChars. */
export function auditContext(diff: string, maxChars: number): string {
	const shown = diff.length > maxChars ? diff.slice(0, maxChars) + `\n… diff truncated (${diff.length} chars in total)` : diff;
	return "```diff\n" + shown + "\n```";
}

const criteria = (step: PlanStep) => `Accept criteria: ${step.accept}. Its verify \`${step.verify}\` passed.`;

/** What an audit vote may judge, and where everything else goes: a vote on anything else blocks every honest step. */
const AUDIT_SCOPE = `In this audit your VOTE judges exactly two things: (1) every accept criterion is implemented and really asserted by the verify; (2) the verify is genuine: no hardcoded OK, no weakened threshold, no skipped or trivial assertion, nothing that would pass without the work. APPROVE when both hold. Any other concern from your lens (robustness, cleanup on failure, side effects, style, future risks) never changes the vote: after your bullets write a line \`NOTES:\` and list those concerns there; MAGI records them for the next steps.`;

/** The first audit council: does the diff do the step, and is the verify real? */
export function auditQuestion(step: PlanStep): string {
	return `LIFT-OFF audit of the step "${step.text}". ${criteria(step)} ${AUDIT_SCOPE} REJECT when a criterion is missing or the verify is faked, and name it.`;
}

/** The second audit council: uphold or refute each objection of the first. */
export function rebuttalQuestion(step: PlanStep, tally: string, objections: string): string {
	return `LIFT-OFF audit, second council on the step "${step.text}". ${criteria(step)} ${AUDIT_SCOPE} The first council did not reach consensus (${tally}). Its objections:\n\n${objections}\n\nCheck every objection against the diff. An objection stands only if it shows a missing criterion or a faked verify; an objection about anything else does not stand, move it to NOTES. APPROVE when no objection stands; otherwise vote REJECT and name the objection that stands.`;
}

/** NOTES.md with the audit's notes for a step appended to its Pitfalls section (created when missing). */
export function addAuditNotes(md: string, step: string, notes: readonly { unit: string; notes: string }[]): string {
	const block = notes.map((n) => `- **Audit of "${step}", ${n.unit}:** ${n.notes.replace(/\s*\n\s*/g, " ")}`).join("\n");
	const lines = md.replace(/\s*$/, "").split("\n");
	const head = lines.findIndex((l) => /^## Pitfalls\s*$/.test(l));
	if (head < 0) return `${lines.join("\n")}\n\n## Pitfalls\n${block}\n`;
	const next = lines.findIndex((l, i) => i > head && /^## /.test(l));
	const at = next < 0 ? lines.length : next;
	lines.splice(at, 0, ...(next < 0 ? [block] : [block, ""]));
	return lines.join("\n") + "\n";
}
