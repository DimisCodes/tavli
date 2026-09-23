# 3. Features are the real prompt

[← State and questions](02-state-and-questions.md) · [Index](README.md) · [Next: Confidence and gating →](04-confidence-and-gating.md)

This is the chapter that changed how we built everything else.

With a chat model, when output is poor you reach for the prompt. With Jev that instinct is close to
useless. What moves the answer is the **description of each option**. The wording around it does
almost nothing.

We did not assume this. We measured it.

## The symptom

The first version of Tavli played like a coward. Given any move that exposed a checker, it refused.
Across a full game it chose the zero-risk option **21 times out of 21** opportunities.

On a benchmark of the 15 distinct opening rolls, graded against settled backgammon theory, it
scored **5.0 out of 15**. Every single error was the same shape: shuffle one checker twice to a
safe point instead of doing anything useful.

## The wrong diagnosis

Our instructions said, in as many words, "safety first when the opponent can hit". Obviously that
was the problem. So we wrote two more variants:

- **A** — the shipped instructions, safety-first framing.
- **B** — rebalanced. Explicitly says pip count alone does not decide a play, that making key
  points is worth more than saving pips, and that leaving a checker exposed is often correct.
- **C** — variant B, plus four new descriptive fields about back checkers, builders and stacking.

Same positions, same candidates, one variable changed at a time. The harness is
[`scripts/ablation.live.ts`](../scripts/ablation.live.ts).

```
VARIANT A (shipped wording)      best=4  ok=2  error=9   score 5.0 / 15
VARIANT B (rebalanced wording)   best=4  ok=2  error=9   score 5.0 / 15
VARIANT C (wording + new facts)  best=4  ok=2  error=9   score 5.0 / 15
```

Identical. Not similar, identical: the same nine errors and very nearly the same chosen play on
every roll, including on the variant that explicitly argued exposure is worth taking.

**Prompt tuning did not move this model.** If you take one thing from these docs, take that.

## The right diagnosis

We dumped the exact facts Jev was shown for one roll it kept getting wrong, 6-5, where the correct
play is textbook:

```
24/13        pips=156  blots=1  hit%=61  Eloss=0.6   oppHome=1   ← the correct play
13/7 13/8    pips=156  blots=1  hit%=47  Eloss=8.5   oppHome=1   ← what Jev chose
```

Look at those two rows as a model would.

The correct play shows a **61% chance of being hit**. The play Jev preferred shows 47%. By the
number that looks like risk, the correct play is worse.

But the column that actually matters is `Eloss`, the expected cost in pips. The correct play risks
**0.6 pips**. The one Jev picked risks **8.5**, fourteen times more. The exposed checker in the
correct play sits on the 24-point, where being hit costs almost nothing, because it has barely
started its journey.

Jev was not being irrational. It was doing exactly what we asked with the numbers we gave it. We
showed it a scary-looking percentage and a correct-but-quiet one, and it used the scary one.

## The fixes

**Price risk in the same unit as reward.** A probability of something bad is not comparable to a
gain in pips. An expected loss in pips is. So we compute it:

```ts
// src/engine/features.ts
export function priceRisk(after: Board, color: Color) {
  const rolls = blotHitRolls(after, color);   // per-blot, how many of 36 rolls hit it
  let expected = 0;
  for (const [idx, count] of Object.entries(rolls)) {
    const cost = 25 - pipsFromIndex(color, Number(idx));  // pips lost if this one is hit
    expected += (count / 36) * cost;
  }
  return { expected_pip_loss_if_hit: Math.round(expected * 10) / 10, /* ... */ };
}
```

Now `expected_pip_loss_if_hit` sits next to `pip_count_after` in the same units, and "gains 8,
risks 3" is a comparison anyone can make, including a model that is not thinking very hard.

**Withhold the misleading number.** We kept computing the raw hit percentage for the user interface
and for analysis, but we stopped sending it:

```ts
// src/jev/player.ts — what Jev is shown for each play
function featuresForJev(f: PlayFeatures): Structured {
  const { chance_of_being_hit_percent, worst_case_pip_loss_if_hit, ...rest } = f;
  return { ...rest };
}
```

This feels wrong the first time you do it. You are deliberately hiding true information from the
model. But a true number presented on a scale that invites the wrong comparison is not neutral
information, it is a thumb on the scale. If you cannot express something in a unit that trades
against the others, consider leaving it out.

**Show a genuinely varied menu.** We were sending the top N candidates by a single score, which
quietly meant every option on the list was the same kind of play. Now the shortlist guarantees
variety by construction:

```ts
// src/jev/player.ts — shortlist()
scored.slice(0, 4).forEach(c => add(c, 'well rated'));
add(bestBy(f => f.hits_opponent_blots),                'most aggressive');
add(bestBy(f => -f.expected_pip_loss_if_hit),          'safest');
add(bestBy(f => f.home_board_points * 10 + f.longest_prime), 'best structure');
add(bestBy(f => f.borne_off_after * 100 - f.pip_count_after), 'best race');
add(bestBy(f => f.builders_bearing_on_unmade_points),  'most builders');
```

If an option never reaches the list, no amount of good judgement can select it. Ranking is a filter,
and filters have opinions.

## Result

The benchmark moved from 5.0 to 6.5 on risk pricing alone, and the character of the play changed
immediately: it started leaving builders in useful places rather than shuffling checkers to safety.
The zero-risk-always rate dropped from 21 of 21 to 24 of 34.

[Chapter 4](04-confidence-and-gating.md) takes it from 6.5 to 8.0.

## The general lesson

Jev only ever sees what you describe. It cannot look at the board, it cannot tell that a number you
gave it is misleading, and it will not infer a quantity you left out.

So the work is not prompt engineering. The work is **deciding what the decision actually depends
on, computing it, and expressing it on a scale that makes the trade-off visible.** That is ordinary
modelling, and it is the same skill you would need to write the heuristic yourself.

Which raises a fair question: if you have to understand the problem that well anyway, what is the
model adding? Honest answer, for this project: guaranteed-valid output, a usable confidence signal,
and judgement on the parts that stayed genuinely ambiguous. That is worth something. It is not
worth pretending it is domain expertise.

---

[← State and questions](02-state-and-questions.md) · [Index](README.md) · [Next: Confidence and gating →](04-confidence-and-gating.md)
