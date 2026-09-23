/**
 * Minimal client for TypeSafe's System One API as proxied by OpenRouter.
 *
 * Wire format (identical on api.typesafe.ai/v1/systemone and openrouter.ai/api/v1/systemone):
 *   request  { model, state, questions: { id: { type, instructions, criteria } } }
 *   response { model, answers: { id: { type, choice|score|noul, probabilities?, confidence? } }, usage }
 */

export const JEV_MODEL = '~typesafe/jev-latest';

export type Structured = string | number | boolean | null | Structured[] | { [k: string]: Structured };

export interface ChoiceQuestion {
  type: 'choice';
  instructions: Structured;
  criteria: Record<string, Structured>;
}

export interface ScoreQuestion {
  type: 'score';
  instructions: Structured;
  criteria: Structured[];
}

export interface NoulQuestion {
  type: 'noul';
  instructions: Structured;
  criteria?: { true?: Structured; false?: Structured };
}

export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export interface SystemOneRequest {
  model: string;
  state: Structured;
  questions: Record<string, Question>;
}

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface ScoreAnswer {
  type: 'score';
  score: number;
  probabilities: Record<string, number>;
  legend: Record<string, Structured>;
  confidence: number;
}

export interface NoulAnswer {
  type: 'noul';
  noul: number;
}

export type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cost?: number;
}

export interface SystemOneResponse {
  model: string;
  answers: Record<string, Answer>;
  usage: Usage;
  id?: string;
  provider?: string;
}

export interface JevCall {
  request: SystemOneRequest;
  response: SystemOneResponse;
  latencyMs: number;
}

export class JevError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Dev/preview server proxies this path to OpenRouter and attaches the API key. */
const ENDPOINT = '/api/jev/systemone';

export async function systemOne(request: SystemOneRequest, signal?: AbortSignal): Promise<JevCall> {
  const started = performance.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  const latencyMs = Math.round(performance.now() - started);
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new JevError(res.status, `Non-JSON response from Jev (${res.status})`);
  }
  if (!res.ok) {
    const err = (json as { error?: { message?: string } }).error;
    throw new JevError(res.status, err?.message ?? `Jev request failed (${res.status})`);
  }
  return { request, response: json as SystemOneResponse, latencyMs };
}
