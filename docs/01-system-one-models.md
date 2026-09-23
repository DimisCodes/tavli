# 1. System One models

[← Index](README.md) · [Next: State and questions →](02-state-and-questions.md)

The name borrows from Kahneman. System Two is slow, deliberate reasoning, which is what a chat
model imitates when it thinks out loud. System One is the fast, automatic judgement you make
before you have finished reading the sentence. Jev is built to be that, for software.

## What it actually does

You send state and typed questions. You get typed answers back, each with a probability
distribution. There is no prose anywhere in the exchange.

```http
POST https://openrouter.ai/api/v1/systemone
Authorization: Bearer <OPENROUTER_KEY>
Content-Type: application/json

{
  "model": "~typesafe/jev-latest",
  "state": { "message": "I was charged twice and nobody has replied in three days." },
  "questions": {
    "urgency": { "type": "noul", "instructions": "Does this message express urgency?" }
  }
}
```

```json
{
  "model": "typesafe/jev-1.13",
  "answers": { "urgency": { "type": "noul", "noul": 0.86 } },
  "usage": { "input_tokens": 354, "output_tokens": 54, "cost": 0.0000148 }
}
```

Two things are worth pausing on.

**There is no parsing step.** You are not asking a model to "respond only with JSON" and then
hoping. The response shape is a consequence of the question types you sent. An answer that does
not fit cannot be returned.

**Only input tokens are billed.** Output is free, because there is barely any. This changes the
economics of asking speculatively, which [chapter 5](05-code-vs-model.md) makes use of.

## The three primitives

Everything you can ask is one of three shapes.

### Noul — a yes/no probability

```json
{ "type": "noul", "instructions": "Should black offer the doubling cube now?" }
```

Returns a single number between 0 and 1. There is no separate confidence field, because the
number already carries both the answer and the certainty. 0.5 means genuinely undecided.

Optional `criteria` sharpens the boundary:

```json
{
  "type": "noul",
  "instructions": "Should black accept this double rather than resign?",
  "criteria": {
    "true": "Black still has a real chance, roughly one game in four or better.",
    "false": "Black is very likely to lose; giving up one point now is cheaper."
  }
}
```

In Tavli, both cube decisions are Nouls. See [`src/jev/player.ts`](../src/jev/player.ts), function
`cubeQuestion`.

### Choice — pick one of a set

```json
{
  "type": "choice",
  "instructions": "Which game plan best fits black in this position?",
  "criteria": {
    "race": "Contact is gone; win by rolling home faster.",
    "priming": "Build consecutive blocking points in front of the back checkers.",
    "blitz": "Attack loose checkers and close the home board."
  }
}
```

Returns the selected option, a probability for **every** option, and a confidence:

```json
{
  "type": "choice",
  "choice": "priming",
  "probabilities": { "race": 0.04, "priming": 0.81, "blitz": 0.15 },
  "confidence": 0.72
}
```

Up to 255 options. The option descriptions can be objects rather than strings, which is how Tavli
describes candidate moves — each option is a small bundle of facts about that move rather than a
sentence. That turns out to matter a great deal, and is the subject of
[chapter 3](03-features-are-the-prompt.md).

### Score — rate against ordered levels

```json
{
  "type": "score",
  "instructions": "How much risk should black accept on this turn?",
  "criteria": [
    "Play as safely as possible. Being hit now would be close to losing.",
    "Lean safe. Only accept exposure for a clear, concrete gain.",
    "Balanced. Ordinary exposure is an acceptable price for an ordinary gain.",
    "Lean aggressive. Being hit costs little here, so contest points.",
    "Take large risks. Black is losing the quiet game and needs chances."
  ]
}
```

Two to ten levels, ordered low to high. The answer is a weighted average, not a bucket:

```json
{
  "type": "score",
  "score": 1.43,
  "probabilities": { "0": 0.0, "1": 0.57, "2": 0.43, "3": 0.0, "4": 0.0 },
  "confidence": 0.35,
  "legend": { "0": "Play as safely as possible...", "1": "..." }
}
```

`score` is Σ(level × probability). A 1.43 means it is genuinely between levels 1 and 2, which is
more useful than being forced to round. Tavli feeds that fractional score straight into a weight,
in `riskWeightFor`.

**Write levels as situations, not as degrees.** "Broken, but a workaround exists" works. "Moderately
severe" does not. Numbers in level text do not help either; the model needs something concrete to
match against.

## What Jev is not

It will not write your code, explain its reasoning, or hold a conversation. It is not a small
language model, and TypeSafe are explicit that it is not an LLM at all. There is no setting that
turns your coding agent into a Jev-powered agent.

It is a component you put **inside** an application, at the points where the application needs a
judgement it cannot compute.

## Calling it

Jev does not appear in OpenRouter's `/api/v1/models` listing, and `/chat/completions` rejects it
with a clear error. The endpoint is `/api/v1/systemone`, and the request shape is the one above.
`/api/alpha/decisions` accepts the same payload.

The whole client used by this project is about 60 lines:
[`src/jev/client.ts`](../src/jev/client.ts).

---

[← Index](README.md) · [Next: State and questions →](02-state-and-questions.md)
