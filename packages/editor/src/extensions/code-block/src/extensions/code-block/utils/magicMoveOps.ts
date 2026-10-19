import type { CodeBlockElement, CodeBlockMagicMove } from "../../../types";

const normalizeHighlightLines = (value?: string): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export const normalizeMagicMove = (
  magicMove: CodeBlockElement["magicMove"]
): CodeBlockMagicMove | null => {
  if (!magicMove || !Array.isArray(magicMove.steps) || magicMove.steps.length < 1) {
    return null;
  }

  const steps = magicMove.steps.map((step, index) => ({
    id: step.id || `step-${index + 1}`,
    title: step.title,
    code: typeof step.code === "string" ? step.code : "",
    highlightLines: normalizeHighlightLines(step.highlightLines),
  }));

  const activeStep = Math.min(Math.max(Number(magicMove.activeStep) || 0, 0), steps.length - 1);

  return {
    v: 1,
    activeStep,
    steps,
  };
};

export const getSafeActiveStep = (magicMove: CodeBlockMagicMove): number => {
  return Math.min(
    Math.max(Number(magicMove.activeStep) || 0, 0),
    Math.max(magicMove.steps.length - 1, 0)
  );
};

export const getActiveStepCode = (magicMove: CodeBlockMagicMove, fallbackCode: string): string => {
  const activeStep = getSafeActiveStep(magicMove);
  return magicMove.steps[activeStep]?.code ?? fallbackCode;
};

export const getActiveStepHighlightLines = (
  magicMove: CodeBlockMagicMove,
  fallbackHighlightLines?: string
): string | undefined => {
  const activeStep = getSafeActiveStep(magicMove);
  return (
    normalizeHighlightLines(magicMove.steps[activeStep]?.highlightLines) ??
    normalizeHighlightLines(fallbackHighlightLines)
  );
};

export const createNextStepId = (steps: Array<{ id: string }>): string => {
  const existingIds = new Set(steps.map(step => step.id));
  let index = steps.length + 1;
  while (existingIds.has(`step-${index}`)) {
    index += 1;
  }
  return `step-${index}`;
};

export const createInitialMagicMove = (
  sourceCode: string,
  sourceHighlightLines?: string
): CodeBlockMagicMove => {
  const highlightLines = normalizeHighlightLines(sourceHighlightLines);
  return {
    v: 1,
    activeStep: 1,
    steps: [
      { id: "step-1", code: sourceCode, highlightLines },
      { id: "step-2", code: sourceCode, highlightLines },
    ],
  };
};

export const insertNextMagicMoveStep = (
  magicMove: CodeBlockMagicMove,
  fallbackCode: string,
  fallbackHighlightLines?: string
): CodeBlockMagicMove => {
  const activeStep = getSafeActiveStep(magicMove);
  const currentCode = magicMove.steps[activeStep]?.code ?? fallbackCode;
  const currentHighlightLines =
    normalizeHighlightLines(magicMove.steps[activeStep]?.highlightLines) ??
    normalizeHighlightLines(fallbackHighlightLines);
  const nextSteps = [...magicMove.steps];
  nextSteps.splice(activeStep + 1, 0, {
    id: createNextStepId(nextSteps),
    code: currentCode,
    highlightLines: currentHighlightLines,
  });

  return {
    ...magicMove,
    activeStep: activeStep + 1,
    steps: nextSteps,
  };
};

export const removeMagicMoveStep = (
  magicMove: CodeBlockMagicMove,
  fallbackCode: string,
  fallbackHighlightLines?: string,
  targetStep?: number
): {
  removed: boolean;
  code: string;
  highlightLines?: string;
  magicMove: CodeBlockMagicMove | null;
} => {
  if (magicMove.steps.length < 1) {
    return {
      removed: false,
      code: fallbackCode,
      highlightLines: normalizeHighlightLines(fallbackHighlightLines),
      magicMove: null,
    };
  }

  const activeStep = getSafeActiveStep(magicMove);
  const safeTarget = Math.min(
    Math.max(typeof targetStep === "number" ? targetStep : activeStep, 0),
    magicMove.steps.length - 1
  );

  if (magicMove.steps.length === 1) {
    return {
      removed: false,
      code: getActiveStepCode(magicMove, fallbackCode),
      highlightLines: getActiveStepHighlightLines(magicMove, fallbackHighlightLines),
      magicMove,
    };
  }

  const nextSteps = magicMove.steps.filter((_, index) => index !== safeTarget);
  if (nextSteps.length < 2) {
    return {
      removed: true,
      code: nextSteps[0]?.code ?? fallbackCode,
      highlightLines:
        normalizeHighlightLines(nextSteps[0]?.highlightLines) ??
        normalizeHighlightLines(fallbackHighlightLines),
      magicMove: null,
    };
  }

  const nextActiveStep = Math.min(safeTarget, nextSteps.length - 1);
  const nextMagicMove: CodeBlockMagicMove = {
    ...magicMove,
    activeStep: nextActiveStep,
    steps: nextSteps,
  };

  return {
    removed: true,
    code: nextSteps[nextActiveStep]?.code ?? fallbackCode,
    highlightLines:
      normalizeHighlightLines(nextSteps[nextActiveStep]?.highlightLines) ??
      normalizeHighlightLines(fallbackHighlightLines),
    magicMove: nextMagicMove,
  };
};
