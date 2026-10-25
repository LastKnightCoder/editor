import type { CodeBlockV2Element, CodeStepElement } from "./types";

export interface CodeBlockLocalView {
  activeStepId: string;
  isFold?: boolean;
  foldHeight?: number;
}

export interface CodeBlockConversion {
  element: CodeBlockV2Element;
  view: CodeBlockLocalView;
  recovery: { reason: "root-source-conflict"; code: string; stepId: string }[];
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 仅供宿主基线转换；调用方先持久保存原始数据和恢复材料，再安装返回的新节点。 */
export function convertLegacyCodeBlock(
  input: unknown,
  createIdentity: () => string = () => crypto.randomUUID()
): CodeBlockConversion {
  if (!record(input) || input.type !== "code-block" || typeof input.code !== "string") {
    throw new Error("旧代码块源码无效，须保留原始数据后处理");
  }
  if (
    !Array.isArray(input.children) ||
    input.children.some(child => !record(child) || child.text !== "")
  ) {
    throw new Error("旧代码块含额外正文，不能自动丢弃");
  }
  const original = structuredClone(input);
  const {
    code,
    magicMove,
    highlightLines,
    isFold,
    foldHeight,
    children: _children,
    tauContract: _contract,
    ...properties
  } = original;
  const identities = new Set<string>();
  const identity = () => {
    const id = createIdentity();
    if (!id || identities.has(id)) throw new Error("源码步骤身份重复或无效");
    identities.add(id);
    return id;
  };
  const createStep = (value: Record<string, unknown>): CodeStepElement => {
    if (
      typeof value.code !== "string" ||
      (value.title !== undefined && typeof value.title !== "string") ||
      (value.highlightLines !== undefined && typeof value.highlightLines !== "string")
    ) {
      throw new Error("旧代码步骤格式无效，须保留原始数据后处理");
    }
    const {
      id: _id,
      collabId: _collabId,
      tauContract: _stepContract,
      children: _stepChildren,
      ...business
    } = value;
    return {
      ...business,
      type: "code-step",
      code: value.code,
      collabId: identity(),
      children: [{ type: "formatted", text: "" }],
    } as CodeStepElement;
  };
  let steps: CodeStepElement[],
    active = 0;
  if (magicMove !== undefined && magicMove !== null) {
    if (
      !record(magicMove) ||
      magicMove.v !== 1 ||
      !Array.isArray(magicMove.steps) ||
      magicMove.steps.length === 0 ||
      magicMove.steps.some(step => !record(step)) ||
      !Number.isSafeInteger(magicMove.activeStep)
    ) {
      throw new Error("旧代码步骤列表无效，不能自动转换");
    }
    active = Math.min(Math.max(magicMove.activeStep as number, 0), magicMove.steps.length - 1);
    steps = magicMove.steps.map(step => createStep(step as Record<string, unknown>));
    if (steps[active].highlightLines === undefined && typeof highlightLines === "string")
      steps[active].highlightLines = highlightLines;
  } else {
    steps = [createStep({ code, ...(highlightLines === undefined ? {} : { highlightLines }) })];
  }
  const activeStepId = steps[active].collabId!;
  return {
    element: {
      ...properties,
      type: "code-block",
      children: steps,
    } as unknown as CodeBlockV2Element,
    view: {
      activeStepId,
      ...(typeof isFold === "boolean" ? { isFold } : {}),
      ...(typeof foldHeight === "number" && Number.isFinite(foldHeight) ? { foldHeight } : {}),
    },
    recovery:
      steps[active].code === code
        ? []
        : [{ reason: "root-source-conflict", code: code as string, stepId: activeStepId }],
  };
}
