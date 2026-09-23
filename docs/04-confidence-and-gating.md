# 4. Confidence and gating

[← Features are the real prompt](03-features-are-the-prompt.md) · [Index](README.md) · [Next: What code should own →](05-code-vs-model.md)

Choice and Score answers come with a `confidence` number. It is easy to treat it as decoration and
render it as a percentage somewhere. It is considerably more useful than that: on our measurements
it is the single best predictor of whether Jev is about to be wrong.

## Confidence is not probability

They answer different questions.

**Probability** says how likely each outcome is. **Confidence** says how concentrated that
distribution is, in one number.

```json
{ "choice": "A", "probabilities": { "A": 0.34, "B": 0.33, "C": 0.33 }, "confidence": 0.01 }
{ "choice": "A", "probabilities": { "A": 0.96, "B": 0.02, "C": 0.02 }, "confidence": 0.94 }
```

Both picked A. Only one of them meant it. The first is a coin toss wearing a decision's clothing,
and if you only read `choice` you cannot tell the two apart.

For three options the formula is `(3 × largest probability − 1) / 2`, generalising so that a flat
distribution is 0 and a spike is 1. You could compute it yourself from `probabilities`; it is
returned because thresholding on it is such a common need.

Noul has no confidence field. It does not need one, because a Noul of 0.5 *is* the flat
distribution. Distance from 0.5 is the confidence.

## Is it actually calibrated?

Worth checking rather than believing. We logged every in-game decision along with the full
candidate set, then went back and scored the ones with an objectively correct answer, which in
backgammon means the bear-off, where taking the maximum number of checkers off is simply right.

| | count | mean confidence |
|---|---|---|
| Correct picks | 2 | **0.89** |
| Wrong picks | 2 | **0.41** |
| All decisions | 38 | 0.75 |

Small numbers, so treat the exact figures lightly. But the direction was unambiguous and held up
elsewhere: both objective errors Jev made in that match were among the three least confident
decisions it made all game, out of 38.

When Jev is about to be wrong, it usually says so.

## Gating

If low confidence predicts errors, then low confidence should change what you do. TypeSafe call
this confidence-gated routing, and it is the highest-leverage change we made.

```ts
// src/jev/player.ts
export const CONFIDENCE_FLOOR = 0.5;

const best   = call.response.answers.best_play as ChoiceAnswer;
const gated  = best.confidence < CONFIDENCE_FLOOR;
const chosen = gated
  ? [...withProbs].sort((a, b) => b.score - a.score)[0]   // deterministic evaluation decides
  : picked;                                               // Jev's pick stands

return { source: gated ? 'gated' : 'jev', chosen, confidence: best.confidence, /* ... */ };
```

Note what this is not. It is not a retry, and it is not a second opinion from another model. It is
a fallback to logic you already have, taken only when the model itself signals it is guessing.

The benchmark moved from **6.5 to 8.0 out of 15**. Gating fired on 5 of the 15 opening rolls and
converted three of them from errors to correct play, including recovering the lover's leap, the
most famous opening move in the game.

In a full match it fired on 19 of 63 contested decisions, roughly 30%.

## Choosing the threshold

Pick it from your data, not from taste. Log confidence alongside outcomes for a while, then look at
where the errors cluster. Ours sat plainly below 0.5.

As a starting point before you have data, TypeSafe suggest:

- **above 0.9** — act automatically, even for consequential things
- **0.5 to 0.9** — act, but consider confirming or gathering more
- **below 0.5** — do not act on it alone; route to a human, a default, or deterministic logic

The right number depends on what being wrong costs you. In a game, a bad move is cheap, so 0.5 is
comfortable. Approving a payment is not a game.

## Say when you did it

If the model's answer was overridden, show that. Tavli labels the move in the interface:

> Low confidence, so the deterministic evaluation decided

This matters for a showcase, where quietly substituting your own logic and presenting it as the
model's judgement would be dishonest. It matters just as much in a product, where the first
question anyone asks about a surprising decision is which system actually made it.

## A second use: thresholds as policy

Gating is binary, but the same signal can be a dial. Tavli's cube decisions are Nouls, and the
threshold encodes how aggressive the player is:

```ts
export const DOUBLE_THRESHOLD = 0.45;   // offer the cube above this
export const TAKE_THRESHOLD   = 0.50;   // accept a double above this
```

The doubling threshold started at 0.65, which seemed like a sensible bar for a consequential
action. Over 59 live cube decisions Jev never once crossed it, and the game silently never used its
doubling cube at all.

The signal was fine. Its probability tracked the position, correlating with the pip lead at r =
+0.36, averaging 0.20 when behind and 0.42 when ahead. It simply never reached 0.65, because the
model is conservative about asserting a strong yes.

**Calibrate thresholds against the distribution the model actually produces, not against how
important the decision feels to you.** A threshold no output ever reaches is not a safety measure,
it is a disabled feature.

---

[← Features are the real prompt](03-features-are-the-prompt.md) · [Index](README.md) · [Next: What code should own →](05-code-vs-model.md)
