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

export type PlanStep = { line: number; done: boolean; text: string; verify?: string };

const STEP = /^\s*[-*] \[([ xX])\] (.+)$/;
const VERIFY = /\s*[—–-]+\s*verify:\s*`([^`]+)`\s*$/i;

/** The checklist in PLAN.md: `- [ ] step — verify: \`command\``. Other lines are free text. */
export function parsePlan(md: string): PlanStep[] {
	const steps: PlanStep[] = [];
	md.split("\n").forEach((raw, line) => {
		const m = STEP.exec(raw);
		if (!m) return;
		const v = VERIFY.exec(m[2]!);
		steps.push({ line, done: m[1] !== " ", text: (v ? m[2]!.slice(0, v.index) : m[2]!).trim(), verify: v?.[1]!.trim() });
	});
	return steps;
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
	const blind = steps.find((s) => !s.done && !s.verify);
	return blind ? `step without a verify command: "${blind.text}"` : undefined;
}

/** ■ done, ▶ current (✗ when its verification failed), □ waiting. */
export function progressBar(total: number, current: number, failed = false): string {
	return Array.from({ length: total }, (_, i) => (i < current ? "■" : i === current ? (failed ? "✗" : "▶") : "□")).join("");
}

export function simulationPrompt(goal: string): string {
	return `SIMULATION: plan only. Goal: ${goal}

Explore the code and discuss the approach with the user. Do not change any file except ${PLAN_FILE} and ${NOTES_FILE}: other writes are blocked.
Write ${PLAN_FILE} as a checklist, in execution order, one line per step:
- [ ] <step> — verify: \`<shell command that exits 0 only if the step works>\`
Each step runs later in a fresh session that knows only ${PLAN_FILE}, ${NOTES_FILE} and the code, so:
- keep each step small enough for one short session, with a concrete verify command (tests, build, a script);
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

It is verified with \`${step.verify}\`: run it yourself before you finish.
Do only this step. Do not tick ${PLAN_FILE} and do not commit: MAGI does both once the verification passes.
Before you finish, add to ${NOTES_FILE}, as short bullets under its headings (Key files, Commands that work, Decisions, Pitfalls), what the next steps need to know.${retry}`;
}
