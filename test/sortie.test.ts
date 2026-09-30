// Run: node --test test/
import assert from "node:assert/strict";
import { test } from "node:test";
import { lensNotes, objectionsText, splitNotes } from "../extensions/magi/council.ts";
import { addAuditNotes, auditQuestion, changedPaths, parsePlan, planProblem, progressBar, rebuttalQuestion, tickStep, touches } from "../extensions/magi/sortie.ts";

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

test("splitNotes keeps the lens's notes out of the reasons for the vote", () => {
	assert.deepEqual(splitNotes("- criteria met\nNOTES:\n- no finally on failure"), { reasons: "- criteria met", notes: "- no finally on failure" });
	assert.deepEqual(splitNotes("- criteria met\n**NOTES:** leaks state"), { reasons: "- criteria met", notes: "leaks state" });
	assert.deepEqual(splitNotes("- no notes at all"), { reasons: "- no notes at all", notes: "" });
	const ballots = [
		{ unit: "MELCHIOR", vote: "APPROVE" as const, text: "- ok\nNOTES:\n- style" },
		{ unit: "BALTHASAR", vote: "REJECT" as const, text: "- (b) not asserted\nNOTES:\n- cleanup" },
	];
	assert.equal(objectionsText(ballots), "BALTHASAR (REJECT): - (b) not asserted");
	assert.deepEqual(lensNotes(ballots).map((n) => n.notes), ["- style", "- cleanup"]);
});

test("the audit questions scope the vote to the criteria and ask for NOTES", () => {
	const [step] = parsePlan("- [ ] 2. X\n  - accept: (a) y\n  - verify: `v`\n  - files: f");
	for (const q of [auditQuestion(step!), rebuttalQuestion(step!, "M APPROVE", "B: z")]) {
		assert.match(q, /\(a\) y/);
		assert.match(q, /never changes the vote/);
		assert.match(q, /NOTES:/);
	}
});

test("addAuditNotes appends to Pitfalls, before the next section, or creates it", () => {
	const notes = [{ unit: "BALTHASAR", notes: "- no finally\n- leaks spy" }];
	assert.equal(
		addAuditNotes("## Decisions\n- d\n\n## Pitfalls\n- p\n\n## Later\n- l\n", "7. Cargo", notes),
		'## Decisions\n- d\n\n## Pitfalls\n- p\n\n- **Audit of "7. Cargo", BALTHASAR:** - no finally - leaks spy\n\n## Later\n- l\n',
	);
	assert.match(addAuditNotes("## Pitfalls\n- p\n", "s", notes), /^## Pitfalls\n- p\n- \*\*Audit of "s"/);
	assert.match(addAuditNotes("# N\n", "s", notes), /# N\n\n## Pitfalls\n- \*\*Audit/);
});
