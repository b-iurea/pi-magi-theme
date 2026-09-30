# The LIFT-OFF audit: what it catches, what it misses, how to use it

After a LIFT-OFF step passes its verify, touches its files and breaks no earlier step, the three
MAGI audit the diff. This page sums up how that audit works, what an experiment measured, and how
to get the most out of it.

## How it works

1. **The whole diff, or no audit.** The council reads `git diff HEAD` without `NOTES.md` (prose),
   new files included. A diff over 200 000 characters stops the sortie: split the step.
2. **The vote judges two things only:** every `accept` criterion is implemented and really
   asserted by the verify, and the verify is genuine (no hardcoded OK, weakened threshold, skipped
   or trivial assertion). Everything else a MAGI notices goes under `NOTES:` and never changes the vote.
3. **Consensus, as for NERV's major decisions.** The step passes only with three APPROVE.
4. **Dissent goes to a second council.** Any CONDITIONAL or REJECT is put to a new council,
   which checks each objection against the diff. It passes only if all three agree that no
   objection shows a missing criterion or a faked verify. Otherwise the objections that stand
   become the failure the retry reads.
5. **A MAGI that cannot vote stops the sortie.** An audit that did not happen is never a pass.
6. **Nothing is lost.** Every deliberation is saved in the step's session (`/resume`), the commit
   carries `Audit: …`, and the MAGI's notes are appended to the Pitfalls in `NOTES.md` for the next steps.

## What the experiment measured

`experiments/council-audit.ts` replays two real steps of a LIFT-OFF run (cargo, slam) through the
production audit: the honest diff, plus three one-line sabotages of its selftest. The sabotages are
failures logged but reported OK, a threshold weakened (message unchanged), and a criterion's check
deleted. It uses the same personas, rules, prompts and consensus as production, with 3 repetitions
per case.

| Audit | Honest passed | Sabotage caught |
|---|---|---|
| diff cut at 24k chars, vote on everything (before) | 1/4 | 11/12, mostly blind: the sabotaged line was past the cut |
| whole diff, vote on everything | 1/4 | 12/12 |
| **whole diff, vote scoped to the criteria (now)** | **12/12** | **36/36** |

Same result with deepseek-flash ×3 and deepseek-v4-pro ×3. Honest steps pass with three APPROVE in
the first council, so they cost no second council. All 12 honest runs also left useful notes, such
as a selftest restoring its state outside a `finally`.

## Strengths

- **Catches the fakes a model is tempted by:** a test that cannot fail, a loosened threshold, a
  criterion silently dropped. It caught all of them when the council saw the whole diff.
- **Does not block honest work,** once the vote is scoped: a MAGI's lens (risk, style) no longer
  vetoes a step whose criteria are met.
- **Fails closed:** a missing vote, an aborted council or a diff too large to read stop the
  sortie instead of letting the step through.
- **Leaves a trail:** why a step passed or failed is in the session, the commit and `NOTES.md`.

## Weaknesses

- **Small evidence.** Two steps and single-line sabotages, written by a human and fairly visible.
  Subtle fakes, or fakes the executor model writes itself, are not measured yet.
- **Correlated judges.** With the default config the three MAGI are the session model, the same
  one that wrote the code. Personas change *what* a MAGI looks at, not *what* it can see. A blind
  spot of the model is a blind spot of all three, and LLM judges tend to favour output like their own.
- **It judges the diff, not the running code.** It cannot run the verify. It trusts that what it
  reads is what ran, and a fake spread across many files is harder to spot than a one-line one.
- **Only as good as the `accept` criteria.** The vote checks the criteria you wrote. A vague
  criterion ("works well") gives the council nothing to hold the diff to.
- **Cost and time.** Three calls per step, six when there is dissent, each reading the whole diff.
  Big steps are slow and, on local models, may not fit the context.

## How to use it best

- **Write `accept` as numbered, measurable criteria:** (a), (b), … with numbers and comparisons
  (STORM vs GLASS, 2× speed → 2× advance). The council checks each one against an assertion in the diff.
- **Make the verify a test the step writes, and fix its assertions in the plan.** Then the audit
  only has to confirm that the test asserts what the plan says.
- **Keep steps small.** The whole diff must be read. Under ~50 000 characters keeps it fast, and
  fits local models.
- **Mix the models.** Give at least one MAGI a model different from the executor in `magi.json`
  (`MELCHIOR`, `BALTHASAR`, `CASPAR`; the keys are the unit names). With three different model
  families, three APPROVE mean three independent views.
- **Read the notes.** The Pitfalls the audit adds to `NOTES.md` are real bugs outside the step's
  criteria; turn the important ones into criteria of a later step.
- **Watch the trail when something feels off.** `/resume` a step's session to read the full
  deliberations, and `git log` shows each step's `Audit:` line.

## Next experiments

- The mixed council (`--arms mixed`, needs llama-swap) against subtler sabotages.
- Sabotages written by the executor model itself, to measure self-preference.
- Audit duties per MAGI: the same two questions, checked by a different method each (map every criterion to its assertion, hunt for a way the test passes without the work, imagine the implementation broken and ask whether the verify notices), against the current personas.
