import type { BoardElement } from "../types";
import type { StandardSchemaV1 } from "./standard-schema";
import type { ElementDefinitionTable } from "./elementVersion";
import { readDefinitionSchemaVersion, readElementSchemaVersion } from "./elementVersion";

/** 单个元素的校验问题：element.data 未通过所属定义的 schema */
export interface ElementValidationProblem {
  elementId: string;
  type: string;
  issues: readonly StandardSchemaV1.Issue[];
}

/** 提交的数据不合规：整批操作都不应用（原子） */
export class WhiteboardValidationError extends Error {
  readonly problems: readonly ElementValidationProblem[];

  constructor(problems: readonly ElementValidationProblem[]) {
    super(formatProblems(problems));
    this.name = "WhiteboardValidationError";
    this.problems = problems;
  }
}

/** 中文概括第一个问题，供异常 message 与迁移失败报告共用 */
export function formatProblems(problems: readonly ElementValidationProblem[]): string {
  const first = problems[0];
  if (!first) return "白板元素数据不合规";
  const issue = first.issues[0];
  const rest = problems.length > 1 ? `（等 ${problems.length} 个问题）` : "";
  return `白板元素 ${first.elementId}（${first.type}）数据不合规：${issue?.message ?? "未知问题"}${rest}`;
}

/**
 * 递归校验元素树：只检查「定义带 schema 且元素 schemaVersion 等于定义版本」的元素的 element.data。
 * 版本不兼容（占位中）的元素跳过；validate 返回 Promise 或抛错均视为失败。
 */
export function validateElementTree(
  nodes: readonly BoardElement[],
  definitions: ElementDefinitionTable
): ElementValidationProblem[] {
  const problems: ElementValidationProblem[] = [];
  const visit = (element: BoardElement) => {
    const definition = definitions.get(element.type);
    const schema = definition?.schema;
    if (schema && readElementSchemaVersion(element) === readDefinitionSchemaVersion(definition!)) {
      const problem = validateElementData(element, schema);
      if (problem) problems.push(problem);
    }
    element.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return problems;
}

/**
 * 在执行结果上收集校验问题：新树与旧树按 id 逐一比较元素引用（applyOperations 为
 * copy-on-write 纯函数，未改动的元素保持原引用），引用变化或新增且「带 schema 且
 * 版本兼容」的元素才校验 data。父元素引用未变则其子树必然未变，整棵剪枝。
 */
export function collectChangedElementProblems(
  oldChildren: readonly BoardElement[],
  newChildren: readonly BoardElement[],
  definitions: ElementDefinitionTable
): ElementValidationProblem[] {
  if (oldChildren === newChildren) return [];
  if (!hasSchemaDefinition(definitions)) return [];
  const oldById = new Map<string, BoardElement>();
  const index = (element: BoardElement) => {
    oldById.set(element.id, element);
    element.children?.forEach(index);
  };
  oldChildren.forEach(index);
  const problems: ElementValidationProblem[] = [];
  const visit = (element: BoardElement) => {
    if (oldById.get(element.id) === element) return;
    const definition = definitions.get(element.type);
    if (
      definition?.schema &&
      readElementSchemaVersion(element) === readDefinitionSchemaVersion(definition)
    ) {
      const problem = validateElementData(element, definition.schema);
      if (problem) problems.push(problem);
    }
    element.children?.forEach(visit);
  };
  newChildren.forEach(visit);
  return problems;
}

function hasSchemaDefinition(definitions: ElementDefinitionTable): boolean {
  for (const definition of definitions.values()) {
    if (definition.schema) return true;
  }
  return false;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as PromiseLike<unknown> | null | undefined)?.then === "function";
}

function validateElementData(
  element: BoardElement,
  schema: StandardSchemaV1
): ElementValidationProblem | null {
  const failed = (issues: readonly StandardSchemaV1.Issue[]): ElementValidationProblem => ({
    elementId: element.id,
    type: element.type,
    issues,
  });
  let result: StandardSchemaV1.Result<unknown> | Promise<StandardSchemaV1.Result<unknown>>;
  try {
    result = schema["~standard"].validate(element.data);
  } catch (error) {
    return failed([{ message: error instanceof Error ? error.message : String(error) }]);
  }
  if (isPromiseLike(result)) {
    return failed([{ message: "白板元素 schema 必须同步校验" }]);
  }
  return result.issues ? failed(result.issues) : null;
}
