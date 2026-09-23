# 6. Measuring decision quality

[← What code should own](05-code-vs-model.md) · [Index](README.md)

Everything in the previous chapters is a claim about what improved the model's output. None of it
would be worth writing down without a way to tell. This chapter is about building that.

A decision model makes it unusually easy, because the output is typed. There is no rubric needed to
judge whether prose is good. There is just: was this the right choice, yes or no.

## Find ground truth you did not invent

The temptation is to grade against your own heuristic. That measures agreement, not quality, and it
will happily confirm whatever bias your heuristic already has.

Backgammon is lucky here. The fifteen distinct opening rolls have been settled by decades of
computer rollouts, so there is a published right answer for each, and it was not produced by us:

```ts
// scripts/openings.live.ts
const OPENINGS = [
  { dice: [3, 1], best: ['8/5 6/5'],        ok: [],                note: 'make the 5-point' },
  { dice: [6, 1], best: ['13/7 8/7'],       ok: [],                note: 'make the bar point' },
  { dice: [6, 5], best: ['24/13'],          ok: [],                note: "lover's leap" },
  { dice: [5, 1], best: ['24/23 13/8'],     ok: ['13/8 6/5'],      note: 'split the back checkers' },
  // ...
];
```

Grading in three bands rather than two matters. `best` is the top rollout play, `ok` is within a
small equity margin, and anything else is an error. Scoring 1 for best and 0.5 for ok gives a
number sensitive enough to detect a change without punishing defensible differences of style.

Most domains have an equivalent if you look: historical outcomes, expert-labelled samples, a slower
and more expensive process you are trying to replace. If you truly have none, that is worth knowing
before you start tuning.

## Score the whole system, then attribute

A benchmark tells you the score. It does not tell you what to change. For that you need to vary one
thing at a time, which is how we found that instructions did not matter
([chapter 3](03-features-are-the-prompt.md)).

```ts
// scripts/ablation.live.ts — same positions, same candidates, one variable changed
for (const v of ['A', 'B', 'C']) {
  const criteria = v === 'C' ? { ...features, ...extraFeatures(board) } : { ...features };
  const call = await systemOne({
    model: JEV_MODEL,
    state: { rules: RULES, dice, candidate_plays: criteria },
    questions: { best_play: { type: 'choice', instructions: v === 'A' ? INSTRUCTIONS_A : INSTRUCTIONS_B, criteria } },
  });
}
```

Three variants, 45 calls, about 20 seconds, and roughly two cents. Cheap enough that there is no
excuse for guessing.

## Keep the whole decision, not just the answer

The most useful thing we did was log every candidate the model was shown, not only the one it
picked:

```ts
candidates: dec.candidates.map(c => ({
  id: c.id, play: notation(JEV, c.play), probability: c.probability,
  pips: c.features.pip_count_after,
  eloss: c.features.expected_pip_loss_if_hit,
  blots: c.features.own_blots_after,
  hits: c.features.hits_opponent_blots,
  // ...
})),
```

That record is what let us re-analyse a finished match in new ways without spending a penny on
fresh calls. Every metric below came out of one saved JSON file.

## Metrics that told us something

**Strictly dominated picks.** Did another option beat the chosen one on *every* measured axis at
once? This is style-neutral, so it cannot be argued with. Early on: 0 of 38, which was genuine
evidence the model was not blundering even while it was playing badly.

Be careful as your feature set grows. After adding builders to the features, our dominance test
started flagging plays as dominated that were in fact textbook-correct, because the test did not
include the new axis. **A stale metric reads as a regression.** Update the test with the features.

**Objective sub-cases.** In the bear-off, taking fewer checkers off than possible is simply wrong.
Isolating that gave us a clean correct/incorrect label, which is what made the calibration analysis
in [chapter 4](04-confidence-and-gating.md) possible.

**Behavioural signatures.** "Chose the zero-risk option 21 times out of 21" is not about any single
decision; it is a description of character. It located the problem far faster than looking at
individual moves, because the pattern was the bug.

**Disagreement with your own baseline.** Agreeing with a 40-line heuristic 15 times out of 15 told
us the model was adding nothing on that task. A low disagreement rate is a warning, not a comfort.

## Play the whole thing, not just positions

Position benchmarks miss compounding effects. A full game harness plays to a finish against a fixed
reference opponent, which surfaces things single positions cannot: that a quiet opening loses the
race by move 20, that three consecutive dances decide a game, that the doubling cube is never used
at all.

Keep the reference opponent fixed and deterministic. Ours is the heuristic already in the codebase.
It is not a strong player, which is fine: the point is that it does not change between runs, so
score differences mean something.

And keep the harness honest. Ours initially scored a declined double as a backgammon worth three
points, when a declined double is worth exactly the cube value. A scoring bug in the grader is
worse than no grader, because it is confidently wrong.

## Keep live tests out of the normal suite

Anything that calls the API needs to be separable from tests that run on every save:

```ts
// vitest.live.config.ts
export default defineConfig({
  test: { include: ['scripts/**/*.live.ts'], testTimeout: 1_800_000, fileParallelism: false },
});
```

```bash
yarn test                                                        # offline, fast, free
yarn vitest run --config vitest.live.config.ts scripts/openings.live.ts   # costs money
```

## What the numbers actually said

Four changes, each measured, each kept only because the score moved:

```
baseline                          5.0 / 15
risk priced in pips               6.5 / 15
notation fix + raw risk withheld  6.0 / 15
confidence gating                 8.0 / 15
```

Alongside that, across four full games: the zero-risk-always rate fell from 100% to 71%, bear-off
errors went to zero by construction, the doubling cube started being used, and Jev won a game
including a gammon worth four points.

## Two honest caveats

**Small samples move around.** The dip from 6.5 to 6.0 in the table above is one roll out of
fifteen. Do not tell a story about a difference that size.

**Do not tune to the benchmark.** Fifteen cases is few enough to overfit by accident. Every change
we kept was justified by a reason that would hold if the benchmark did not exist: risk should be
comparable to reward, a filter should not hide whole styles of play, a model that says it is
guessing probably is. The benchmark confirmed them. It did not generate them.

---

[← What code should own](05-code-vs-model.md) · [Index](README.md)
