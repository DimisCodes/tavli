# 2. State and questions

[← System One models](01-system-one-models.md) · [Index](README.md) · [Next: Features are the real prompt →](03-features-are-the-prompt.md)

A request has two halves and the split between them is the first design decision you make.

**State** is what is true. **Questions** are what you want judged about it.

Keeping facts out of questions and judgements out of state sounds obvious, and is the thing people
get wrong first, usually by writing a question that smuggles in the answer.

## State

State can be a string, an object or an array of strings. Prefer an object: every part gets a name,
and the relationships stay legible.

Here is what Tavli sends for a board position, from `positionForJev` in
[`src/jev/player.ts`](../src/jev/player.ts):

```json
{
  "black_checkers_by_point": { "24": 2, "13": 5, "8": 3, "6": 5 },
  "white_checkers_by_point": { "1": 2, "12": 5, "17": 3, "19": 5 },
  "black_on_bar": 0,
  "white_on_bar": 0,
  "black_borne_off": 0,
  "white_borne_off": 0,
  "black_pip_count": 167,
  "white_pip_count": 167,
  "black_home_board_points": 1,
  "white_home_board_points": 1,
  "black_longest_prime": 1,
  "white_longest_prime": 1,
  "no_contact_race": false
}
```

Note what this is not. It is not a picture of the board, and it is not the internal array the game
engine actually uses. It is a description written for a reader who knows backgammon, using the
vocabulary of the game.

Three deliberate choices in there:

**Everything is named from one player's perspective.** Jev always plays black, and every number is
from black's point of view. Mixed perspectives are the single easiest way to confuse a model about
a two-sided game.

**Derived quantities are included, not left to be computed.** `black_pip_count` is a sum the model
could in principle work out from the checker positions. Do not make it. Computing is what your code
is for, and every quantity you hand over is one it does not have to get right.

**The vocabulary is explained once, in state.** Tavli ships a small glossary alongside the
position:

```json
{
  "rules": {
    "game": "Backgammon, standard rules, doubling cube in play.",
    "you_play": "black",
    "numbering": "Points are numbered from black's perspective. Black moves from 24 down toward 1...",
    "glossary": {
      "blot": "A single checker alone on a point; it can be hit if white lands on it.",
      "anchor": "A point black holds inside white's home board, giving a safe landing spot.",
      "prime": "Consecutive held points that block white's back checkers."
    }
  }
}
```

A note on naming: the branding of this project is Greek, but the state says "backgammon", not
"tavli". Use the words the model is most likely to have seen. Your product name is not part of the
domain.

## Questions

Questions are evaluated **independently and in parallel**. This is the single most important
operational fact about the API, and it has two consequences.

### Consequence one: ask many at once, nearly free

Since extra questions do not cost a round trip, ask everything you might need and let your code
decide what is relevant. TypeSafe call this speculative fan-out.

Tavli's position read asks four things in one call:

```ts
questions: {
  plan:     { type: 'choice', instructions: 'Which game plan best fits black right now?', criteria: GAME_PLANS },
  risk:     { type: 'score',  instructions: 'How much risk should black accept this turn?', criteria: RISK_LEVELS },
  threat:   { type: 'score',  instructions: "How dangerous is white's position to black?",   criteria: THREAT_LEVELS },
  standing: { type: 'score',  instructions: 'How does black stand overall?',                 criteria: STANDING_LEVELS },
}
```

One request, four judgements, about 400 ms.

### Consequence two: one answer cannot inform another

If question B needs the answer to question A, they must be **separate calls**. There is no way to
chain within a request.

This is why a Tavli turn costs two calls rather than one. The first reads the position. Code then
uses the risk appetite from that read to build a shortlist of candidate moves. The second asks Jev
to choose from that shortlist. The second request could not have existed before the first came
back, because its options depend on the answer.

```
call 1: read the position        →  risk appetite 1.7 of 4
                                     ↓
code:   weight = f(1.7) = 1.49; shortlist 8 of 16 legal plays using that weight
                                     ↓
call 2: choose among those 8     →  probabilities, confidence
```

If you find yourself wanting a chain longer than two, stop and ask whether the middle step is
really code's job. It usually is.

## Writing instructions

Instructions can be a string, or structure. Structure helps when a question has parts:

```ts
instructions: {
  question: 'Which of these plays is strongest for black with this roll?',
  how_to_judge: [
    'Every candidate is legal and fully described in `candidate_plays`; compare their facts.',
    'Risk is already priced in pips. Compare expected_pip_loss_if_hit against what the play gains.',
    'Making home-board points and holding an anchor have lasting value that outlives a few pips.',
  ],
}
```

Backtick references to paths in the state are a convention TypeSafe use, and they read clearly.

A warning that [chapter 3](03-features-are-the-prompt.md) will make concrete: do not expect this
list to do much work. We rewrote it three different ways, including one that argued the opposite
case, and the answers did not change at all. Write instructions that are clear and honest, then
put your real effort into the facts you are describing.

## One judgement per question

Split compound questions. Instead of "is this spam?", ask whether it requests credentials, whether
the sender domain conflicts with the claimed identity, and whether it announces an unexpected
reward. Three Nouls, one call, and your code combines them with weights you control and can tune.

The version with one broad question gives you a verdict you cannot inspect or adjust. The version
with three gives you a model of the problem.

---

[← System One models](01-system-one-models.md) · [Index](README.md) · [Next: Features are the real prompt →](03-features-are-the-prompt.md)
