import {
  createGraph,
  edge,
  eventGuards,
  operation,
  outcome,
  reduce,
  suspend,
  wait,
  type EdgeDecision,
  type GraphDefinition,
  type GraphUpdate,
  type NodeEvent,
  type WorkflowAgentHarness,
  type WorkflowUiFeedback,
} from '@yourtechbudstudio/isagi-workflow-sdk';

// A headless judgment whose reply the workflow's own parser turns into a route or result. A judgment
// that does not complete or cannot be parsed is judged again, up to three attempts, and then pauses
// so the user can look. After Continue it returns `rejudge`: the caller reads the latest reply again
// before judging, so a reply the user changed meanwhile is the one judged. It never fails its caller.

export type JudgmentParameters = {
  /** The judged role, for example "writer" or "reviewer". */
  readonly label: string;
  readonly profile: { readonly harness: WorkflowAgentHarness; readonly model?: string; readonly effort?: string };
  readonly prompt: string;
  /** Set before every attempt. */
  readonly feedback?: WorkflowUiFeedback;
};

export type JudgmentOutput<Route> = { readonly outcome: 'judged'; readonly route: Route } | { readonly outcome: 'rejudge' };

const MAX_ATTEMPTS = 3;

type State<Route> = {
  readonly request: JudgmentParameters;
  readonly operationId: string | null;
  readonly attempts: number;
  readonly error: string | null;
  readonly route: Route | null;
};

/** One judgment graph per parser. `key` must be unique across the composed workflow. */
export function createJudgmentGraph<Route>(spec: {
  readonly key: string;
  readonly title: string;
  readonly parse: (output: string) => Route;
}): GraphDefinition<State<Route>, State<Route>, JudgmentParameters, JudgmentOutput<Route>> {
  type S = State<Route>;
  return createGraph<S, {}, JudgmentParameters, JudgmentOutput<Route>>({
    key: spec.key,
    title: spec.title,
    label: (parameters) => `Route the ${parameters.label}`,
    init: (_destination, request) => ({ request, operationId: null, attempts: 0, error: null, route: null }),
    state: {
      request: reduce.replace<JudgmentParameters>(),
      operationId: reduce.replace<string | null>(),
      attempts: reduce.replace<number>(),
      error: reduce.replace<string | null>(),
      route: reduce.replace<Route | null>(),
    },
    entry: 'judge',
    nodes: {
      judge: operation<S, S>(async (ctx, state) => {
        const { label, profile, prompt, feedback } = state.request;
        if (feedback) await ctx.setUiFeedback(feedback);
        const handle = await ctx.runHeadlessAgent({ ...profile, prompt });
        await ctx.log('info', `Started ${label} routing judgment ${handle.operationId} (attempt ${state.attempts + 1}/${MAX_ATTEMPTS}).`);
        return suspend({ update: { operationId: handle.operationId, attempts: state.attempts + 1 }, wait: wait.headlessAgent(handle) });
      }, { title: 'Run the judgment' }),

      askUser: operation<S, S>(async (ctx, state) => {
        const { label } = state.request;
        await ctx.setUiFeedback({ kind: 'warning', phase: `The ${label} response could not be routed`, message: `The ${label} judgment failed ${MAX_ATTEMPTS} times. Check the logs, then select Continue to read the latest response and judge it again.` });
        await ctx.log('warning', `${label} routing failed: ${state.error ?? 'unknown error'}`);
        return suspend({ wait: wait.userContinue(`The ${label} response could not be routed. Continue to judge it again.`) });
      }, { title: 'Ask the user before judging again' }),
    },
    edges: {
      afterJudge: edge<S, S>({
        from: 'judge',
        to: ['judged', 'judge', 'askUser'],
        choose: (state, event) => routeJudgment(state, event, spec.parse),
      }),
      afterAskUser: edge<S, S>({ from: 'askUser', to: ['rejudge'], choose: () => ({ to: 'rejudge' }) }),
    },
    outcomes: {
      judged: outcome({
        kind: 'success',
        title: 'Judged',
        output: (state) => {
          if (state.route === null) throw new Error('Judgment state is missing its route.');
          return { outcome: 'judged', route: state.route };
        },
      }),
      rejudge: outcome({ kind: 'success', title: 'Judge again', output: () => ({ outcome: 'rejudge' }) }),
    },
  });
}

function routeJudgment<Route>(state: State<Route>, event: NodeEvent, parse: (output: string) => Route): EdgeDecision<GraphUpdate<State<Route>>> {
  if (state.operationId === null) throw new Error('Judgment state is missing its operation.');
  const result = eventGuards.requireHeadless(event, state.operationId);
  let error: string;
  if (result.status === 'completed') {
    try {
      return { to: 'judged', update: { route: parse(result.output ?? ''), error: null } };
    } catch (parseError) {
      error = parseError instanceof Error ? parseError.message : String(parseError);
    }
  } else {
    error = `Judgment did not complete${result.error ? `: ${result.error}` : ''}.`;
  }
  return { to: state.attempts < MAX_ATTEMPTS ? 'judge' : 'askUser', update: { error } };
}
