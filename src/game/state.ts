import type { Board, Color, Dice, From, Step } from '../engine/types';
import { initialBoard, isHomeIndex, opponent } from '../engine/board';
import { applyStep, legalNextSteps, notation, planTurn, type TurnPlan } from '../engine/moves';
import type { CubeDecision, CubeState, MoveDecision } from '../jev/player';

export const HUMAN: Color = 'white';
export const JEV: Color = 'black';
export const MATCH_TO = 5;

export type Stacks = Record<string, string[]>;

export type Phase =
  | 'opening'
  | 'to_roll'
  | 'moving'
  | 'no_move'
  | 'jev_cube'
  | 'jev_thinking'
  | 'jev_moving'
  | 'human_doubled'
  | 'jev_doubled'
  | 'game_over';

export type WinKind = 'single' | 'gammon' | 'backgammon' | 'dropped';

export interface Snapshot {
  board: Board;
  stacks: Stacks;
  remaining: number[];
  steps: Step[];
}

export interface LogEntry {
  id: number;
  who: Color | 'game';
  text: string;
}

export interface JevStats {
  calls: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface JevPanelState {
  status: 'idle' | 'thinking' | 'done' | 'error';
  move: MoveDecision | null;
  cube: CubeDecision | null;
  pendingSteps: Step[];
  stats: JevStats;
}

export interface GameState {
  gen: number;
  board: Board;
  stacks: Stacks;
  turn: Color;
  phase: Phase;
  dice: Dice | null;
  remaining: number[];
  plan: TurnPlan | null;
  steps: Step[];
  history: Snapshot[];
  selected: From | null;
  cube: CubeState;
  cubeChecked: boolean;
  score: Record<Color, number>;
  matchTo: number;
  gameNumber: number;
  openingRoll: { white: number; black: number } | null;
  result: { winner: Color; kind: WinKind; points: number; matchOver: boolean } | null;
  log: LogEntry[];
  jev: JevPanelState;
}

export type Action =
  | { type: 'NEW_GAME' }
  | { type: 'NEW_MATCH' }
  | { type: 'OPENING_ROLL'; white: number; black: number }
  | { type: 'ROLL'; dice: Dice }
  | { type: 'SELECT'; from: From | null }
  | { type: 'MOVE'; step: Step }
  | { type: 'UNDO' }
  | { type: 'END_TURN' }
  | { type: 'HUMAN_DOUBLE' }
  | { type: 'HUMAN_TAKE' }
  | { type: 'HUMAN_DROP' }
  | { type: 'JEV_CUBE_START' }
  | { type: 'JEV_CUBE_RESULT'; gen: number; decision: CubeDecision }
  | { type: 'JEV_TAKE_RESULT'; gen: number; decision: CubeDecision }
  | { type: 'JEV_DECIDED'; gen: number; decision: MoveDecision }
  | { type: 'JEV_STEP' };

export const locKey = (color: Color, at: From | 'off' | number): string =>
  at === 'bar' ? `bar-${color}` : at === 'off' ? `off-${color}` : `p${at}`;

function initialStacks(board: Board): Stacks {
  const stacks: Stacks = { 'bar-white': [], 'bar-black': [], 'off-white': [], 'off-black': [] };
  const counters: Record<Color, number> = { white: 0, black: 0 };
  board.points.forEach((p, i) => {
    stacks[`p${i}`] = [];
    if (!p) return;
    for (let k = 0; k < p.count; k++) {
      counters[p.color]++;
      stacks[`p${i}`].push(`${p.color[0]}${counters[p.color]}`);
    }
  });
  return stacks;
}

function applyStepToStacks(stacks: Stacks, color: Color, step: Step): Stacks {
  const next: Stacks = { ...stacks };
  const fromKey = locKey(color, step.from);
  const toKey = locKey(color, step.to);
  next[fromKey] = [...next[fromKey]];
  next[toKey] = [...(next[toKey] ?? [])];
  const id = next[fromKey].pop();
  if (step.hit && step.to !== 'off') {
    const opp = opponent(color);
    const victim = next[toKey].pop();
    const barKey = locKey(opp, 'bar');
    next[barKey] = [...next[barKey], victim!];
  }
  if (id) next[toKey].push(id);
  return next;
}

const emptyJev = (): JevPanelState => ({
  status: 'idle',
  move: null,
  cube: null,
  pendingSteps: [],
  stats: { calls: 0, cost: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0 },
});

export function initialState(): GameState {
  const board = initialBoard();
  return {
    gen: 0,
    board,
    stacks: initialStacks(board),
    turn: HUMAN,
    phase: 'opening',
    dice: null,
    remaining: [],
    plan: null,
    steps: [],
    history: [],
    selected: null,
    cube: { value: 1, owner: null },
    cubeChecked: false,
    score: { white: 0, black: 0 },
    matchTo: MATCH_TO,
    gameNumber: 1,
    openingRoll: null,
    result: null,
    log: [],
    jev: emptyJev(),
  };
}

let logId = 0;
function addLog(state: GameState, who: LogEntry['who'], text: string): GameState {
  return { ...state, log: [...state.log.slice(-79), { id: ++logId, who, text }] };
}

export function canDouble(state: GameState, color: Color): boolean {
  return state.cube.value < 64 && (state.cube.owner === null || state.cube.owner === color);
}

export function legalSteps(state: GameState): Step[] {
  if (state.phase !== 'moving' || !state.plan) return [];
  return legalNextSteps(state.board, state.turn, state.remaining, state.steps.length, state.plan);
}

export function turnComplete(state: GameState): boolean {
  return !!state.plan && state.steps.length >= state.plan.total;
}

function startTurnWithDice(state: GameState, dice: Dice): GameState {
  const plan = planTurn(state.board, state.turn, dice);
  const base: GameState = {
    ...state,
    dice,
    remaining: plan.dice,
    plan,
    steps: [],
    history: [],
    selected: null,
  };
  const logged = addLog(base, state.turn, `rolls ${dice[0]}-${dice[1]}`);
  if (plan.total === 0) return { ...logged, phase: 'no_move' };
  if (state.turn === JEV) {
    return { ...logged, phase: 'jev_thinking', jev: { ...state.jev, status: 'thinking', pendingSteps: [] } };
  }
  const autoSelect: From | null = state.board.bar[HUMAN] > 0 ? 'bar' : null;
  return { ...logged, phase: 'moving', selected: autoSelect };
}

function winKind(board: Board, winner: Color): WinKind {
  const loser = opponent(winner);
  if (board.off[loser] > 0) return 'single';
  const stuck = board.bar[loser] > 0 || board.points.some((p, i) => p && p.color === loser && isHomeIndex(winner, i));
  return stuck ? 'backgammon' : 'gammon';
}

function finishGame(state: GameState, winner: Color, kind: WinKind): GameState {
  const mult = kind === 'gammon' ? 2 : kind === 'backgammon' ? 3 : 1;
  const points = mult * state.cube.value;
  const score = { ...state.score, [winner]: state.score[winner] + points };
  const matchOver = score[winner] >= state.matchTo;
  const who = winner === HUMAN ? 'You' : 'Jev';
  const how = kind === 'dropped' ? 'wins (double declined)' : `wins a ${kind}`;
  const next: GameState = {
    ...state,
    phase: 'game_over',
    score,
    selected: null,
    result: { winner, kind, points, matchOver },
    jev: { ...state.jev, status: 'idle', pendingSteps: [] },
  };
  return addLog(next, 'game', `${who} ${how} for ${points} point${points === 1 ? '' : 's'}`);
}

type CountableCall = { latencyMs: number; response: { usage: { input_tokens: number; output_tokens: number; cost?: number } } };

function accumulate(stats: JevStats, calls: (CountableCall | undefined)[]): JevStats {
  return calls.reduce<JevStats>((acc, call) => {
    if (!call) return acc;
    const u = call.response.usage;
    return {
      calls: acc.calls + 1,
      cost: acc.cost + (u.cost ?? 0),
      inputTokens: acc.inputTokens + u.input_tokens,
      outputTokens: acc.outputTokens + u.output_tokens,
      latencyMs: acc.latencyMs + call.latencyMs,
    };
  }, stats);
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'NEW_MATCH': {
      const fresh = initialState();
      return { ...fresh, gen: state.gen + 1, jev: { ...emptyJev(), stats: state.jev.stats } };
    }
    case 'NEW_GAME': {
      const fresh = initialState();
      return {
        ...fresh,
        gen: state.gen + 1,
        score: state.result?.matchOver ? { white: 0, black: 0 } : state.score,
        gameNumber: state.result?.matchOver ? 1 : state.gameNumber + 1,
        log: state.result?.matchOver ? [] : state.log,
        jev: { ...emptyJev(), stats: state.jev.stats },
      };
    }
    case 'OPENING_ROLL': {
      const starter: Color = action.white > action.black ? HUMAN : JEV;
      const logged = addLog(
        { ...state, openingRoll: { white: action.white, black: action.black }, turn: starter },
        'game',
        `Opening roll ${action.white}-${action.black}: ${starter === HUMAN ? 'you' : 'Jev'} start${starter === HUMAN ? '' : 's'}`,
      );
      return startTurnWithDice(logged, [action.white, action.black]);
    }
    case 'ROLL': {
      if (state.phase !== 'to_roll') return state;
      return startTurnWithDice(state, action.dice);
    }
    case 'SELECT':
      return { ...state, selected: action.from };
    case 'MOVE': {
      if (state.phase !== 'moving' || !state.plan) return state;
      const legal = legalSteps(state).find(
        (s) => s.from === action.step.from && s.to === action.step.to && s.die === action.step.die,
      );
      if (!legal) return state;
      const snapshot: Snapshot = { board: state.board, stacks: state.stacks, remaining: state.remaining, steps: state.steps };
      const idx = state.remaining.indexOf(legal.die);
      const remaining = state.remaining.filter((_, i) => i !== idx);
      const board = applyStep(state.board, state.turn, legal);
      const stacks = applyStepToStacks(state.stacks, state.turn, legal);
      const nextSel: From | null = board.bar[HUMAN] > 0 && remaining.length ? 'bar' : null;
      return { ...state, board, stacks, remaining, steps: [...state.steps, legal], history: [...state.history, snapshot], selected: nextSel };
    }
    case 'UNDO': {
      if (state.phase !== 'moving' || state.history.length === 0) return state;
      const snap = state.history[state.history.length - 1];
      return { ...state, ...snap, history: state.history.slice(0, -1), selected: null };
    }
    case 'END_TURN': {
      if (!['moving', 'no_move', 'jev_moving'].includes(state.phase)) return state;
      if (state.phase === 'moving' && !turnComplete(state)) return state;
      let next = state;
      if (state.steps.length > 0) next = addLog(next, state.turn, notation(state.turn, state.steps));
      else if (state.phase === 'no_move') next = addLog(next, state.turn, 'has no legal move');
      if (next.board.off[state.turn] === 15) return finishGame(next, state.turn, winKind(next.board, state.turn));
      return {
        ...next,
        turn: opponent(state.turn),
        phase: 'to_roll',
        dice: null,
        remaining: [],
        plan: null,
        steps: [],
        history: [],
        selected: null,
        cubeChecked: false,
        jev: { ...next.jev, status: next.jev.status === 'thinking' ? 'idle' : next.jev.status, pendingSteps: [] },
      };
    }
    case 'HUMAN_DOUBLE': {
      if (state.phase !== 'to_roll' || state.turn !== HUMAN || !canDouble(state, HUMAN)) return state;
      return addLog({ ...state, phase: 'human_doubled', jev: { ...state.jev, status: 'thinking' } }, HUMAN, `offers a double to ${state.cube.value * 2}`);
    }
    case 'JEV_TAKE_RESULT': {
      if (action.gen !== state.gen || state.phase !== 'human_doubled') return state;
      const stats = accumulate(state.jev.stats, [action.decision.call]);
      const jev = { ...state.jev, status: 'done' as const, cube: action.decision, stats };
      if (action.decision.decision) {
        const cube = { value: state.cube.value * 2, owner: JEV };
        return addLog({ ...state, phase: 'to_roll', cube, jev }, JEV, `takes. Cube is now ${cube.value}, owned by Jev`);
      }
      return finishGame(addLog({ ...state, jev }, JEV, 'drops the double'), HUMAN, 'dropped');
    }
    case 'JEV_CUBE_START':
      if (state.phase !== 'to_roll' || state.turn !== JEV) return state;
      return { ...state, phase: 'jev_cube', jev: { ...state.jev, status: 'thinking' } };
    case 'JEV_CUBE_RESULT': {
      if (action.gen !== state.gen || state.phase !== 'jev_cube') return state;
      const stats = accumulate(state.jev.stats, [action.decision.call]);
      const jev = { ...state.jev, status: 'done' as const, cube: action.decision, stats };
      if (action.decision.decision) {
        return addLog({ ...state, phase: 'jev_doubled', jev }, JEV, `offers a double to ${state.cube.value * 2}`);
      }
      return { ...state, phase: 'to_roll', cubeChecked: true, jev };
    }
    case 'HUMAN_TAKE': {
      if (state.phase !== 'jev_doubled') return state;
      const cube = { value: state.cube.value * 2, owner: HUMAN };
      return addLog({ ...state, phase: 'to_roll', cube, cubeChecked: true }, HUMAN, `takes. Cube is now ${cube.value}, owned by you`);
    }
    case 'HUMAN_DROP': {
      if (state.phase !== 'jev_doubled') return state;
      return finishGame(addLog(state, HUMAN, 'drops the double'), JEV, 'dropped');
    }
    case 'JEV_DECIDED': {
      if (action.gen !== state.gen || state.phase !== 'jev_thinking') return state;
      const stats = accumulate(state.jev.stats, [action.decision.read?.call, action.decision.call]);
      return {
        ...state,
        phase: 'jev_moving',
        jev: {
          ...state.jev,
          status: action.decision.source === 'fallback' ? 'error' : 'done',
          move: action.decision,
          pendingSteps: [...action.decision.chosen.play],
          stats,
        },
      };
    }
    case 'JEV_STEP': {
      if (state.phase !== 'jev_moving' || state.jev.pendingSteps.length === 0) return state;
      const [step, ...rest] = state.jev.pendingSteps;
      const idx = state.remaining.indexOf(step.die);
      return {
        ...state,
        board: applyStep(state.board, JEV, step),
        stacks: applyStepToStacks(state.stacks, JEV, step),
        remaining: state.remaining.filter((_, i) => i !== idx),
        steps: [...state.steps, step],
        jev: { ...state.jev, pendingSteps: rest },
      };
    }
    default:
      return state;
  }
}
