# 5. What code should own

[← Confidence and gating](04-confidence-and-gating.md) · [Index](README.md) · [Next: Measuring decision quality →](06-measuring-quality.md)

TypeSafe's framing is that you are building AI-powered software, not an AI agent. Control flow,
rules and side effects stay in code. The model appears only where the system needs programmable
common sense.

That sounds like a platitude until you apply it honestly, at which point it starts taking work away
from the model, which feels like failure and is not.

## The rule

Ask yourself: **is there a right answer that can be computed?**

If yes, compute it. A model that agrees with your calculation most of the time is strictly worse
than the calculation, because it costs money, adds latency, and sometimes disagrees.

If no, and the judgement is bounded and describable, that is where Jev earns its place.

## Applying it: the race

Backgammon has a phase change. While the two sides can still hit each other, play is a judgement
call about risk and structure. Once the checkers have passed each other, no contact is possible and
the game becomes pure arithmetic: bear off as fast as you can without wasting pips.

We measured Jev on that phase. In four countable bear-off decisions it left checkers on the board
**twice**, taking four off when five were available and three when four were. Both times its
confidence was among the lowest it produced all game.

Those are not judgement errors. There is a right answer, and it is a short function:

```ts
// src/engine/race.ts
export function evaluateRacePlay(after: Board, color: Color, play: Play): RaceEvaluation {
  const bornOff = after.off[color];
  const gaps    = homeGaps(after, color);
  const wastage = stackWaste(after, color);
  // Taking checkers off dominates everything; then pips, then a clean home board.
  const score = bornOff * 1000 - pips * 8 - gaps * 14 - wastage * 6 - crossovers(after, color) * 3;
  return { play, board: after, score, bornOff, pips, gaps, wastage };
}
```

So Tavli does not ask. When `isRace(board)` is true, code plays the position out and the interface
says so:

> No contact left. Race solved exactly in code.

That removed an entire class of error permanently, and it is the right call even though it makes
the demo slightly less impressive.

It is still honest about it. Jev is *asked* for its read of the position during the race, so the
panel keeps showing its assessment. It simply does not choose the move.

## Applying it: the rules

Nobody should ask a model whether a move is legal. Backgammon's rules include some genuinely fiddly
cases: you must use both dice if any legal sequence allows it, if only one can be played it must be
the larger, doubles play four times, entering from the bar takes priority, and bearing off with a
high die is only allowed from the highest occupied point.

All of that lives in [`src/engine/moves.ts`](../src/engine/moves.ts) with unit tests. Jev never
sees an illegal option because illegal options are never generated.

This is where the typed Choice primitive pays off twice. Code guarantees the menu is legal, and the
type system guarantees the answer is on the menu. Between them, **an illegal move is not
representable**. There is no validation step, no retry loop, no "the model returned something
weird" branch. Across roughly 300 live calls we had zero invalid responses, because invalid was not
one of the options.

## The division in practice

| Concern | Owner | Why |
|---|---|---|
| Legal move generation | code | Rules are rules |
| Feature extraction, risk pricing | code | Arithmetic |
| Which plays to offer | code | Ranking is a filter with opinions ([ch. 3](03-features-are-the-prompt.md)) |
| How much risk suits this position | **Jev** | A judgement, describable, no closed form |
| Which of these eight plays is best | **Jev** | Same |
| Whether to double | **Jev** | Same |
| Bear-off and racing | code | There is a right answer |
| Acting when confidence is low | code | The model told us it was guessing |

Roughly: Jev decides the *policy* and the *preference*. Code decides everything with an answer.

## Using the model's judgement to steer code

The two do not have to be separate. Tavli's position read returns a risk appetite as a Score from 0
to 4, and code turns that into a weight in its own evaluation function:

```ts
export const riskWeightFor = (appetite: number): number =>
  Math.round((2.6 - 0.525 * Math.max(0, Math.min(4, appetite))) * 100) / 100;
```

A cautious read produces a weight near 2.6, which makes the evaluation shy away from exposure. An
aggressive read produces 0.5, which makes it tolerate risk. That weight then shapes the shortlist
Jev is asked to choose from.

So Jev's judgement is in the loop twice: once setting the policy, once making the pick. And when
confidence gating fires and code decides, it is *still* deciding with a weight Jev chose. The
handoff is not a rejection of the model, it is a narrowing of its role.

## When you have taken too much away

There is a real failure mode in the other direction. If you compute everything and the model only
ever ratifies your ranking, you have added cost and latency for nothing.

The test is straightforward: **how often does the model disagree with your heuristic, and is it
right when it does?** In our first version Jev agreed with a 40-line linear function on 15 of 15
benchmark cases, which told us plainly that it was contributing nothing on that task. That finding
is what drove everything in [chapter 3](03-features-are-the-prompt.md).

Measure the disagreement rate. If it is near zero, either your features have collapsed the problem
already, or you are asking the wrong question.

---

[← Confidence and gating](04-confidence-and-gating.md) · [Index](README.md) · [Next: Measuring decision quality →](06-measuring-quality.md)
