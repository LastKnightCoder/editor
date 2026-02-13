export type PanState = "mini" | "normal" | "full";

export type PanTimeline = {
  state: PanState;
  overallProgress: number;
  segmentProgress: {
    miniToNormal: number;
    normalToFull: number;
  };
  isDragging: boolean;
};

export type PanLayout = {
  viewportHeight: number;
  enabledStates: PanState[];
  offsets: Record<PanState, number>;
  lowestState: PanState;
  highestState: PanState;
};

export type PanLayoutParams = {
  viewportHeight: number;
  enabledStates?: PanState[];
  heights?: Partial<{ mini: number; normal: number }>;
};

export type ReleaseDecisionParams = {
  layout: PanLayout;
  startState: PanState;
  offset: number;
  deltaY: number;
  velocityY: number;
  thresholdPx: number;
  velocityThreshold: number;
  closeOnSwipeDownFromLowest?: boolean;
};

const STATE_ORDER: PanState[] = ["mini", "normal", "full"];
const DEFAULT_ENABLED_STATES: PanState[] = ["normal", "full"];
const DEFAULT_NORMAL_HEIGHT_RATIO = 0.78;
const DEFAULT_MINI_HEIGHT_RATIO = 0.42;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getStateIndex(state: PanState): number {
  return STATE_ORDER.indexOf(state);
}

function sortStates(states: PanState[]): PanState[] {
  return [...states].sort((a, b) => getStateIndex(a) - getStateIndex(b));
}

function nextState(
  states: PanState[],
  current: PanState,
  direction: "up" | "down",
): PanState | null {
  const index = states.indexOf(current);
  if (index < 0) return null;
  if (direction === "up") {
    return index + 1 < states.length ? states[index + 1] : null;
  }
  return index - 1 >= 0 ? states[index - 1] : null;
}

function interpolateProgress(
  from: number,
  to: number,
  current: number,
): number {
  const distance = from - to;
  if (Math.abs(distance) < 1e-4) {
    return current <= to ? 1 : 0;
  }
  return clamp((from - current) / distance, 0, 1);
}

function resolveHeight(
  value: number | undefined,
  viewportHeight: number,
  defaultRatio: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return viewportHeight * defaultRatio;
  }
  if (value > 0 && value <= 1) {
    return viewportHeight * value;
  }
  return value;
}

export function resolveEnabledStates(states?: PanState[]): PanState[] {
  const source =
    Array.isArray(states) && states.length > 0
      ? states
      : DEFAULT_ENABLED_STATES;
  const uniq = Array.from(
    new Set(source.filter((state) => STATE_ORDER.includes(state))),
  );
  if (!uniq.includes("full")) {
    uniq.push("full");
  }
  return sortStates(uniq);
}

export function resolvePanLayout(params: PanLayoutParams): PanLayout {
  const viewportHeight = Math.max(1, Math.round(params.viewportHeight));
  const enabledStates = resolveEnabledStates(params.enabledStates);

  const minNormalHeight = Math.min(320, viewportHeight);
  const normalHeight = clamp(
    Math.round(
      resolveHeight(
        params.heights?.normal,
        viewportHeight,
        DEFAULT_NORMAL_HEIGHT_RATIO,
      ),
    ),
    minNormalHeight,
    viewportHeight,
  );

  const miniHeightUpperBound = Math.max(120, normalHeight - 64);
  const miniHeight = clamp(
    Math.round(
      resolveHeight(
        params.heights?.mini,
        viewportHeight,
        DEFAULT_MINI_HEIGHT_RATIO,
      ),
    ),
    96,
    miniHeightUpperBound,
  );

  const offsets: Record<PanState, number> = {
    mini: Math.max(0, viewportHeight - miniHeight),
    normal: Math.max(0, viewportHeight - normalHeight),
    full: 0,
  };

  return {
    viewportHeight,
    enabledStates,
    offsets,
    lowestState: enabledStates[0],
    highestState: enabledStates[enabledStates.length - 1],
  };
}

export function clampOffset(layout: PanLayout, offset: number): number {
  const minOffset = layout.offsets[layout.highestState];
  const maxOffset = layout.offsets[layout.lowestState];
  return clamp(offset, minOffset, maxOffset);
}

export function findNearestState(layout: PanLayout, offset: number): PanState {
  const clamped = clampOffset(layout, offset);
  let nearest = layout.enabledStates[0];
  let minDistance = Number.POSITIVE_INFINITY;
  for (const state of layout.enabledStates) {
    const distance = Math.abs(clamped - layout.offsets[state]);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = state;
    }
  }
  return nearest;
}

export function resolveReleaseDecision(params: ReleaseDecisionParams): {
  nextState: PanState;
  shouldClose: boolean;
} {
  const {
    layout,
    startState,
    offset,
    deltaY,
    velocityY,
    thresholdPx,
    velocityThreshold,
    closeOnSwipeDownFromLowest = true,
  } = params;
  const nearState = findNearestState(layout, offset);
  const shouldSwitch =
    Math.abs(deltaY) >= Math.max(0, thresholdPx) ||
    Math.abs(velocityY) >= Math.max(0, velocityThreshold);

  if (!shouldSwitch) {
    return { nextState: nearState, shouldClose: false };
  }

  const useVelocity = Math.abs(velocityY) >= Math.max(0, velocityThreshold);
  const directionValue = useVelocity ? velocityY : deltaY;

  if (directionValue < 0) {
    return {
      nextState: nextState(layout.enabledStates, startState, "up") ?? nearState,
      shouldClose: false,
    };
  }

  const lower = nextState(layout.enabledStates, startState, "down");
  if (lower) {
    return { nextState: lower, shouldClose: false };
  }

  if (closeOnSwipeDownFromLowest && startState === layout.lowestState) {
    return { nextState: layout.lowestState, shouldClose: true };
  }

  return { nextState: layout.lowestState, shouldClose: false };
}

export function buildPanTimeline(params: {
  layout: PanLayout;
  offset: number;
  state: PanState;
  isDragging: boolean;
}): PanTimeline {
  const { layout, offset, state, isDragging } = params;
  const clamped = clampOffset(layout, offset);
  const overallProgress = interpolateProgress(
    layout.offsets[layout.lowestState],
    layout.offsets[layout.highestState],
    clamped,
  );

  return {
    state,
    overallProgress,
    segmentProgress: {
      miniToNormal: interpolateProgress(
        layout.offsets.mini,
        layout.offsets.normal,
        clamped,
      ),
      normalToFull: interpolateProgress(
        layout.offsets.normal,
        layout.offsets.full,
        clamped,
      ),
    },
    isDragging,
  };
}
