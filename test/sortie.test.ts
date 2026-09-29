// Run: node --test test/
import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePlan, planProblem, progressBar, tickStep } from "../extensions/magi/sortie.ts";

const PLAN = `# Plan
Some context.

- [x] Add the parser — verify: \`npm test\`
- [ ] Wire the command - verify: \`node --test test/ && echo ok\`
* [ ] Update README
- not a step
`;

test("parsePlan reads the checklist, its state and verify commands", () => {
	assert.deepEqual(parsePlan(PLAN), [
		{ line: 3, done: true, text: "Add the parser", verify: "npm test" },
		{ line: 4, done: false, text: "Wire the command", verify: "node --test test/ && echo ok" },
		{ line: 5, done: false, text: "Update README", verify: undefined },
	]);
});

test("planProblem refuses empty, finished and unverifiable plans", () => {
	assert.match(planProblem([])!, /no checklist/);
	assert.match(planProblem(parsePlan("- [x] a — verify: `true`"))!, /already ticked/);
	assert.match(planProblem(parsePlan(PLAN))!, /Update README/);
	assert.equal(planProblem(parsePlan("- [x] a\n- [ ] b — verify: `true`")), undefined);
});

test("tickStep ticks only the named step, and reports a vanished one", () => {
	const ticked = tickStep(PLAN, "Wire the command")!;
	assert.equal(ticked.split("\n")[4], "- [x] Wire the command - verify: `node --test test/ && echo ok`");
	assert.equal(parsePlan(ticked).filter((s) => !s.done).length, 1);
	assert.equal(tickStep(PLAN, "Gone"), undefined);
});

test("progressBar marks done, current and failed steps", () => {
	assert.equal(progressBar(5, 2), "■■▶□□");
	assert.equal(progressBar(3, 1, true), "■✗□");
	assert.equal(progressBar(2, 2), "■■");
});
