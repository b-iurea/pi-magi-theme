// Run: node --test test/
import assert from "node:assert/strict";
import { test } from "node:test";
import { BUDGET_MESSAGE, HYGIENE_DEFAULTS, MAGI_MD, PRUNED_MARK, pruneContext, thinkingBudget, thinkingWasCut, type Msg } from "../extensions/magi/local-models.ts";

const o = { ...HYGIENE_DEFAULTS, stepTokens: 1000 }; // 3000 chars per step

/** One agent turn: 2000 chars of thinking, a read call, a 2000-char result. */
function turn(i: number): Msg[] {
	return [
		{ role: "assistant", content: [{ type: "thinking", thinking: "t".repeat(2000) }, { type: "toolCall", id: `c${i}`, name: "read", arguments: { path: `f${i}.ts` } }] },
		{ role: "toolResult", toolCallId: `c${i}`, toolName: "read", content: [{ type: "text", text: "x\n".repeat(1000) }], isError: false },
	];
}
const session = (n: number): Msg[] => [{ role: "user", content: "do it" }, ...Array.from({ length: n }, (_, i) => turn(i)).flat()];

test("short sessions are untouched", () => {
	const msgs = session(3);
	const { messages, stats } = pruneContext(msgs, o);
	assert.equal(stats.watermark, 0);
	assert.deepEqual(messages, msgs);
});

test("old thinking and outputs are pruned, the tail is kept whole", () => {
	const { messages, stats } = pruneContext(session(20), o);
	assert.ok(stats.watermark > 0 && stats.prunedTokens > 0);
	const first = messages[1]!;
	assert.ok(!first.content.some((c: any) => c.type === "thinking"));
	assert.equal(first.content[0].name, "read"); // the tool call itself survives
	assert.match(messages[2]!.content[0].text, /pruned by MAGI: output of read f0\.ts, 1001 lines/);
	assert.equal(messages[2]!.toolCallId, "c0"); // call/result pairing intact
	const last = messages.at(-2)!;
	assert.ok(last.content.some((c: any) => c.type === "thinking"));
	assert.ok(!messages.at(-1)!.content[0].text.includes(PRUNED_MARK));
});

test("the pruned prefix is stable while the session grows (KV cache friendly)", () => {
	const msgs = session(30);
	const big = { ...o, stepTokens: 5000 }; // a step spans ~4 turns, as the 15k default does on real sessions
	let moves = 0;
	for (let n = 10; n < msgs.length; n++) {
		const a = pruneContext(msgs.slice(0, n), big);
		const b = pruneContext(msgs.slice(0, n + 1), big);
		assert.ok(b.stats.watermark >= a.stats.watermark);
		if (b.stats.watermark === a.stats.watermark) assert.deepEqual(b.messages.slice(0, n), a.messages); // prompt only grows at the end
		else moves++;
	}
	assert.ok(moves > 0 && moves < 20, `watermark moved ${moves} times`); // in steps, not every turn
});

test("big writes become a marker, small ones stay", () => {
	const big = { role: "assistant", content: [{ type: "toolCall", id: "w", name: "write", arguments: { path: "a.html", content: "<p>\n".repeat(3000) } }] };
	const small = { role: "assistant", content: [{ type: "toolCall", id: "s", name: "write", arguments: { path: "b.txt", content: "hi" } }] };
	const { messages } = pruneContext([{ role: "user", content: "go" }, big, small, ...session(6).slice(1)], o);
	assert.match(messages[1]!.content[0].arguments.content, /^<<pruned by MAGI: 3001 lines written/);
	assert.equal(messages[1]!.content[0].arguments.path, "a.html");
	assert.equal(messages[2]!.content[0].arguments.content, "hi");
});

test("thinking budget: high to plan after the user, low between tool calls", () => {
	assert.equal(thinkingBudget({ messages: [{ role: "user", content: "go" }] }), 16384);
	assert.equal(thinkingBudget({ messages: [{ role: "user" }, { role: "assistant" }, { role: "tool" }] }), 4096);
	assert.equal(thinkingBudget({}), 16384);
});

test("a thinking cut at the budget is detected, and MAGI.md tells the model what it means", () => {
	const cut = { role: "assistant", content: [{ type: "thinking", thinking: `long plan…\n\n${BUDGET_MESSAGE}\n` }] };
	const whole = { role: "assistant", content: [{ type: "thinking", thinking: "short plan" }] };
	assert.ok(thinkingWasCut(cut));
	assert.ok(!thinkingWasCut(whole));
	assert.ok(MAGI_MD.includes('starting "Time is up."'));
});
