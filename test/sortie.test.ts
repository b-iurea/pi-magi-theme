// Run: node --test test/
import assert from "node:assert/strict";
import { test } from "node:test";
import { changedPaths, parsePlan, planProblem, progressBar, tickStep, touches } from "../extensions/magi/sortie.ts";

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
	assert.match(planProblem(parsePlan(PLAN))!, /accept criteria: "Wire the command"/);
	assert.match(planProblem(parsePlan("- [ ] b — verify: `true`"))!, /cannot fail/);
	assert.match(planProblem(parsePlan("- [ ] b\n  - accept: x\n  - verify: `npm test`"))!, /without files/);
	assert.equal(planProblem(parsePlan(`- [x] a\n${FULL.split("\n- [ ] 3")[0]}`)), undefined);
});

const FULL = `- [ ] 2. Shading
  - do: Fresnel term in the ocean shader
  - files: page.html, \`tools/\`
  - accept: (a) grazing view 1.3x brighter than look-down
  - verify: \`./tools/run.sh --selftest=shading\`
- [ ] 3. Next — verify: \`make\``;

test("parsePlan reads the standard fields under a step", () => {
	const [s, next] = parsePlan(FULL);
	assert.deepEqual(s, {
		line: 0, done: false, text: "2. Shading", verify: "./tools/run.sh --selftest=shading",
		do: "Fresnel term in the ocean shader", files: ["page.html", "tools/"], accept: "(a) grazing view 1.3x brighter than look-down",
	});
	assert.equal(next!.verify, "make");
	assert.equal(next!.files, undefined);
});

test("touches and changedPaths tell whether the step's files changed", () => {
	const changed = changedPaths(" M NOTES.md\n?? tools/shade.sh\nR  old.js -> src/new.js\n");
	assert.deepEqual(changed, ["NOTES.md", "tools/shade.sh", "src/new.js"]);
	assert.equal(touches(changed, ["tools/"]), true);
	assert.equal(touches(changed, ["./src/new.js"]), true);
	assert.equal(touches(changed, ["page.html", "tool"]), false);
	assert.equal(touches(["NOTES.md"], []), false);
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
