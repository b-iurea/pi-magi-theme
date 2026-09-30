/**
 * The MAGI council without pi: who the three MAGI are, what they are told, how a vote is read.
 * Shared by the extension and by experiments that call the models directly.
 */

export const MAGI_UNITS = ["MELCHIOR", "BALTHASAR", "CASPAR"] as const;
export type MagiUnit = (typeof MAGI_UNITS)[number];

export type Vote = "APPROVE" | "CONDITIONAL" | "REJECT";

/**
 * Three minds, three lenses. A lens works on any subject (a nature, not a specialty), so no MAGI
 * rejects a question just because it is not "its" topic; software is where each lens gets sharpest.
 */
export const MAGI = [
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

export const MAGI_RULES = `You are one of the three MAGI. The council answers whatever the user asks: mostly software engineering, but not only.

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

export function parseVote(text: string): Vote {
	const m = /VOTE:\s*\**\s*(APPROVE|CONDITIONAL|REJECT)/i.exec(text);
	return m ? (m[1]!.toUpperCase() as Vote) : "CONDITIONAL";
}

/** Common function words per language, used to name the reply language explicitly. */
export const LANGUAGE_HINTS: readonly [string, readonly string[]][] = [
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
export function guessLanguage(text: string): string | undefined {
	const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
	const scores = LANGUAGE_HINTS.map(([lang, hints]) => [lang, words.filter((w) => hints.includes(w)).length] as const).sort(
		(a, b) => b[1] - a[1],
	);
	const [best, second] = scores;
	return best![1] >= 2 && best![1] > second![1] ? best![0] : undefined;
}

/** The user message each MAGI receives. The language reminder sits after the question, where the model reads it last. */
export function councilPrompt(project: string, context: string, question: string, contextLabel = "Recent conversation (context only, may be empty)"): string {
	const lang = guessLanguage(question);
	const reminder = lang
		? `(Write your whole answer in ${lang}, even if technical terms in the question are English.)`
		: "(Write your whole answer in the language of this question, even if technical terms in it are English.)";
	return (
		`Project: ${project}\n\n${contextLabel}:\n<context>\n${context}\n</context>\n\n` +
		`Question for the MAGI:\n${question}\n\n${reminder}`
	);
}

/** The consensus audit reads only these fields of an opinion. */
type Ballot = { unit: string; vote: Vote | null; text: string };

const OBJECTION_CHARS = 1500; // characters of each objection carried into the second audit council

/** "MELCHIOR APPROVE, BALTHASAR REJECT, CASPAR ERROR" */
export function voteTally(opinions: readonly Ballot[]): string {
	return opinions.map((o) => `${o.unit} ${o.vote ?? "ERROR"}`).join(", ");
}

/** Every MAGI that did not APPROVE: consensus means this list is empty. */
export function dissenters<T extends Ballot>(opinions: readonly T[]): T[] {
	return opinions.filter((o) => o.vote !== "APPROVE");
}

/** An audit opinion: the part that argues the vote, and the lens's notes after `NOTES:`, which never change it. */
export function splitNotes(text: string): { reasons: string; notes: string } {
	const m = /^\s*\**NOTES:?\**\s*$/im.exec(text) ?? /^\s*\**NOTES:\**/im.exec(text);
	if (!m) return { reasons: text.trim(), notes: "" };
	return { reasons: text.slice(0, m.index).trim(), notes: text.slice(m.index + m[0].length).trim() };
}

/** The dissenting opinions, without their notes, each cut to OBJECTION_CHARS, as the second council reads them. */
export function objectionsText(opinions: readonly Ballot[]): string {
	return dissenters(opinions).map((o) => `${o.unit} (${o.vote}): ${splitNotes(o.text).reasons.slice(0, OBJECTION_CHARS)}`).join("\n\n");
}

const NOTE_CHARS = 600; // characters of each MAGI's notes kept in NOTES.md

/** Each MAGI's notes (the concerns that did not change its vote), cut to NOTE_CHARS; MAGI without notes are left out. */
export function lensNotes(opinions: readonly Ballot[]): { unit: string; notes: string }[] {
	return opinions
		.map((o) => ({ unit: o.unit, notes: splitNotes(o.text).notes.slice(0, NOTE_CHARS) }))
		.filter((n) => n.notes);
}
