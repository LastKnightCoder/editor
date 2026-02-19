import type { CodeBlockElement, CodeBlockMagicMove } from "../../../types";

export const normalizeMagicMove = (
  magicMove: CodeBlockElement["magicMove"],
): CodeBlockMagicMove | null => {
  if (
    !magicMove ||
    !Array.isArray(magicMove.steps) ||
    magicMove.steps.length < 1
  ) {
    return null;
  }

  const steps = magicMove.steps.map((step, index) => ({
    id: step.id || `step-${index + 1}`,
    title: step.title,
    code: typeof step.code === "string" ? step.code : "",
  }));

  const activeStep = Math.min(
    Math.max(Number(magicMove.activeStep) || 0, 0),
    steps.length - 1,
  );

  return {
    v: 1,
    activeStep,
    steps,
  };
};

export const getSafeActiveStep = (magicMove: CodeBlockMagicMove): number => {
  return Math.min(
    Math.max(Number(magicMove.activeStep) || 0, 0),
    Math.max(magicMove.steps.length - 1, 0),
  );
};

export const getActiveStepCode = (
  magicMove: CodeBlockMagicMove,
  fallbackCode: string,
): string => {
  const activeStep = getSafeActiveStep(magicMove);
  return magicMove.steps[activeStep]?.code ?? fallbackCode;
};

export const createNextStepId = (steps: Array<{ id: string }>): string => {
  const existingIds = new Set(steps.map((step) => step.id));
  let index = steps.length + 1;
  while (existingIds.has(`step-${index}`)) {
    index += 1;
  }
  return `step-${index}`;
};

export const createInitialMagicMove = (
  sourceCode: string,
): CodeBlockMagicMove => {
  return {
    v: 1,
    activeStep: 1,
    steps: [
      { id: "step-1", code: sourceCode },
      { id: "step-2", code: sourceCode },
    ],
  };
};

export const insertNextMagicMoveStep = (
  magicMove: CodeBlockMagicMove,
  fallbackCode: string,
): CodeBlockMagicMove => {
  const activeStep = getSafeActiveStep(magicMove);
  const currentCode = magicMove.steps[activeStep]?.code ?? fallbackCode;
  const nextSteps = [...magicMove.steps];
  nextSteps.splice(activeStep + 1, 0, {
    id: createNextStepId(nextSteps),
    code: currentCode,
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
  targetStep?: number,
): {
  removed: boolean;
  code: string;
  magicMove: CodeBlockMagicMove | null;
} => {
  if (magicMove.steps.length < 1) {
    return {
      removed: false,
      code: fallbackCode,
      magicMove: null,
    };
  }

  const activeStep = getSafeActiveStep(magicMove);
  const safeTarget = Math.min(
    Math.max(typeof targetStep === "number" ? targetStep : activeStep, 0),
    magicMove.steps.length - 1,
  );

  if (magicMove.steps.length === 1) {
    return {
      removed: false,
      code: getActiveStepCode(magicMove, fallbackCode),
      magicMove,
    };
  }

  const nextSteps = magicMove.steps.filter((_, index) => index !== safeTarget);
  if (nextSteps.length < 2) {
    return {
      removed: true,
      code: nextSteps[0]?.code ?? fallbackCode,
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
    magicMove: nextMagicMove,
  };
};
