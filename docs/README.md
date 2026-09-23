# Building with Jev: a tutorial

Jev is a System One model from TypeSafe. It does not write text. You hand it a block of state and
some typed questions, and it hands back typed answers with calibrated probabilities, in roughly
400 ms.

That is a genuinely different thing to build against than a chat model, and most of the habits
transfer badly. These six chapters are what we learned building [Tavli](../README.md), a
backgammon game whose opponent is Jev. Every claim here is backed by a measurement from the
harnesses in [`scripts/`](../scripts), not by intuition.

The game is only the worked example. The lessons are about decision models.

## The sixty-second version

- Jev answers **Choice**, **Score** and **Noul** questions. Nothing else.
- Its output is typed, so an invalid answer is structurally impossible. This removes an entire
  category of work you would otherwise do against a chat model.
- **What you show it matters enormously. How you word the request barely matters at all.** We
  rewrote the instructions three ways and got identical answers on all 15 test cases.
- It keys on whichever number in your features looks most alarming, regardless of scale. Express
  costs and benefits in the same unit or it will not weigh them against each other.
- Its confidence is a real signal, not decoration. On our data, correct answers averaged 0.89
  confidence and wrong ones 0.41. Gate on it.
- Keep deterministic work in code. Ask Jev only where you need programmable common sense.

## Chapters

1. **[System One models](01-system-one-models.md)**
   What Jev is and is not, the three question primitives, and the wire format.

2. **[State and questions](02-state-and-questions.md)**
   Turning a board position into a request. What belongs in state, what belongs in a question.

3. **[Features are the real prompt](03-features-are-the-prompt.md)**
   The most valuable thing we learned, with the ablation that proves it.

4. **[Confidence and gating](04-confidence-and-gating.md)**
   Confidence is not probability. How to use it as a control rather than a display.

5. **[What code should own](05-code-vs-model.md)**
   The division of labour, and why we took the endgame away from Jev entirely.

6. **[Measuring decision quality](06-measuring-quality.md)**
   You cannot tune what you cannot score. How we built a grader and what it told us.

## Prerequisites

An [OpenRouter](https://openrouter.ai) key. Jev is `~typesafe/jev-latest`. Around a dollar of
credit is more than enough to work through everything here, since a full game costs about $0.004.

TypeSafe's own documentation is at [docs.typesafe.ai](https://docs.typesafe.ai) and is worth
reading alongside this.
