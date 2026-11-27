import { canonicalContractJson } from "@tau/db-schema/content-contracts";
import type { WhiteboardElementSnapshot, WhiteboardPageSnapshot } from "@tau/collaboration";
import {
  MIND_LAYOUT_IDS,
  MIND_PALETTES,
  MIND_THEME_STYLES,
  resolveMindLayoutId,
  type MindNodeElement,
  type MindRange,
} from "@tau/whiteboard/mindmap";
import { endpointId, pageElements } from "./whiteboard-agent";

export const MIND_ERROR_PREFIX = "WHITEBOARD_MINDMAP_ERROR:";
export const mindFields = [
  "structure",
  "text",
  "style",
  "fold",
  "note",
  "position",
  "boundaries",
  "subtree",
] as const;
export type MindField = (typeof mindFields)[number];
export const isSingleMindLayout = (layout: unknown) => resolveMindLayoutId(layout) !== "mind";
export type MindPrecondition = { id: string } & Record<MindField, string>;
export interface MindDefaults {
  themeId: string;
  themeStyle: "solid" | "soft" | "outline";
  layout: "mind" | "logic" | "org" | "tree";
}
export interface MindErrorDetails {
  code: string;
  message: string;
  operationIndex?: number;
  operationKind?: string;
  path?: string;
  elementIds?: string[];
  expected?: unknown;
  actual?: unknown;
  suggestion: string;
  retry:
    | "fix_arguments"
    | "reread"
    | "refresh_context"
    | "same_request"
    | "after_interaction"
    | "request_permission";
  commitStatus: "not_applied" | "saved" | "unknown";
}

export function mindError(
  code: string,
  message: string,
  extra: Partial<Omit<MindErrorDetails, "code" | "message">> = {}
): never {
  const details: MindErrorDetails = {
    code,
    message,
    suggestion: "根据错误字段修正参数，使用新的 requestId 提交修正后的操作。",
    retry: "fix_arguments",
    commitStatus: "not_applied",
    ...extra,
  };
  throw new Error(MIND_ERROR_PREFIX + JSON.stringify(details));
}

export function mindErrorDetails(error: unknown): MindErrorDetails | undefined {
  const message = error instanceof Error ? error.message : String(error);
  const at = message.indexOf(MIND_ERROR_PREFIX);
  if (at < 0) return;
  try {
    const value: unknown = JSON.parse(message.slice(at + MIND_ERROR_PREFIX.length));
    if (value && typeof value === "object" && "code" in value && "suggestion" in value)
      return value as MindErrorDetails;
  } catch {
    // 非本工具的错误不会被误判为已知提交状态。
  }
}

export function mindObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    mindError("INVALID_ARGUMENT", `${path} 必须是对象`, {
      path,
      actual: value,
      expected: "object",
    });
  return value as Record<string, unknown>;
}

export function mindString(value: unknown, path: string, max = 8192): string {
  if (typeof value !== "string" || value.length > max)
    mindError("INVALID_ARGUMENT", `${path} 必须是长度不超过 ${max} 的字符串`, {
      path,
      actual: typeof value === "string" ? { length: value.length } : value,
      expected: { type: "string", maxLength: max },
    });
  return value;
}

export function mindId(value: unknown, path: string): string {
  const id = mindString(value, path, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id))
    mindError("INVALID_ID", `${path} 不是有效的元素或临时标识`, {
      path,
      actual: id,
      expected: "1–128 个字母、数字、点、下划线或连字符，首位为字母或数字",
      suggestion: "已有元素使用读取结果中的原始 id；新元素使用简短英文临时名称。",
    });
  return id;
}

export function mindInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    mindError("INVALID_ARGUMENT", `${path} 必须是 ${minimum}–${maximum} 的整数`, {
      path,
      actual: value,
      expected: { minimum, maximum },
    });
  return value;
}

export function mindBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean")
    mindError("INVALID_ARGUMENT", `${path} 必须是布尔值`, {
      path,
      actual: value,
      expected: "boolean",
    });
  return value;
}

export function mindEnum<T extends string>(value: unknown, values: readonly T[], path: string): T {
  const found = values.find(item => item === value);
  if (found === undefined)
    mindError("INVALID_ARGUMENT", `${path} 不在允许的取值中`, {
      path,
      actual: value,
      expected: values,
    });
  return found;
}

export function mindKeys(value: Record<string, unknown>, allowed: readonly string[], path: string) {
  const unexpected = Object.keys(value).filter(key => !allowed.includes(key));
  if (unexpected.length)
    mindError("UNKNOWN_FIELD", `${path} 包含不支持的字段：${unexpected.join("、")}`, {
      path,
      actual: unexpected,
      expected: allowed,
      suggestion: "只使用该操作 schema 声明的字段；查看工具说明，勿传入画布内部属性。",
    });
}

export function mindIds(value: unknown, path: string, max = 256): string[] {
  if (!Array.isArray(value) || !value.length || value.length > max)
    mindError("INVALID_ARGUMENT", `${path} 必须包含 1–${max} 个元素 ID`, { path, actual: value });
  const ids = value.map((id, index) => mindId(id, `${path}[${index}]`));
  if (new Set(ids).size !== ids.length)
    mindError("DUPLICATE_ID", `${path} 不能包含重复 ID`, { path, actual: ids });
  return ids;
}

export function mindIndex(page: WhiteboardPageSnapshot) {
  const nodes = new Map<string, WhiteboardElementSnapshot>();
  const parents = new Map<string, WhiteboardElementSnapshot | undefined>();
  const roots = new Map<string, string>();
  const depths = new Map<string, number>();
  const sides = new Map<string, "left" | "right">();
  const hidden = new Map<string, boolean>();
  const visit = (
    node: WhiteboardElementSnapshot,
    parent?: WhiteboardElementSnapshot,
    root?: string,
    depth = 1,
    side: "left" | "right" = "right",
    invisible = false
  ) => {
    nodes.set(node.id, node);
    parents.set(node.id, parent);
    if (node.type === "mind-node") {
      const nested = parent?.type === "mind-node";
      const rootId = nested && root ? root : node.id;
      const level = nested ? depth : 1;
      const direction =
        !nested || level === 2 ? (node.data.direction === "left" ? "left" : "right") : side;
      roots.set(node.id, rootId);
      depths.set(node.id, level);
      sides.set(node.id, direction);
      const owner = nodes.get(rootId);
      const single = resolveMindLayoutId(owner?.data.layout) !== "mind";
      const folded =
        parent &&
        (single
          ? parent.children.length > 0 &&
            parent.children.every(child =>
              Boolean(parent.data[child.data.direction === "left" ? "isLeftFold" : "isRightFold"])
            )
          : Boolean(parent.data[direction === "left" ? "isLeftFold" : "isRightFold"]));
      const childHidden = invisible || Boolean(nested && folded);
      hidden.set(node.id, childHidden);
      node.children.forEach(child => visit(child, node, rootId, level + 1, direction, childHidden));
    } else node.children.forEach(child => visit(child, node));
  };
  page.children.forEach(node => visit(node));
  return { nodes, parents, roots, depths, sides, hidden };
}

export function mindRange(value: unknown): MindRange | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    !("startId" in value) ||
    !("endId" in value) ||
    typeof value.startId !== "string" ||
    typeof value.endId !== "string"
  )
    return;
  return { startId: value.startId, endId: value.endId };
}

/** 结构算法不读取正文与派生测量；原生界面和 Agent 共用同一套范围规则。 */
export function mindStructure(node: WhiteboardElementSnapshot, depth = 1): MindNodeElement {
  return {
    id: node.id,
    type: node.type,
    ...node.geometry,
    level: depth,
    actualHeight: node.geometry.height,
    childrenHeight: 0,
    leftChildrenHeight: 0,
    rightChildrenHeight: 0,
    direction: node.data.direction === "left" ? "left" : "right",
    ...(typeof node.data.layout === "string" ? { layout: node.data.layout } : {}),
    isLeftFold: Boolean(node.data.isLeftFold),
    isRightFold: Boolean(node.data.isRightFold),
    summaryRange: mindRange(node.data.summaryRange),
    boundaries: Array.isArray(node.data.boundaries)
      ? node.data.boundaries.flatMap(value => {
          const range = mindRange(value);
          return range &&
            value &&
            typeof value === "object" &&
            "id" in value &&
            typeof value.id === "string"
            ? [
                {
                  ...range,
                  id: value.id,
                  ...("title" in value && typeof value.title === "string"
                    ? { title: value.title }
                    : {}),
                },
              ]
            : [];
        })
      : undefined,
    text: [],
    children: node.children.map(child => mindStructure(child, depth + 1)),
  };
}

export const mindCapabilities = {
  operations: [
    "insert",
    "edit_text",
    "move",
    "copy",
    "remove",
    "fold",
    "configure",
    "summary",
    "boundary",
    "relation",
    "note",
  ],
  layouts: MIND_LAYOUT_IDS,
  palettes: MIND_PALETTES.map(({ id, label }) => ({ id, label })),
  themeStyles: MIND_THEME_STYLES.map(({ value }) => value),
  fields: mindFields,
  note: "使用稳定实体引用关联笔记；新建或编辑笔记正文使用已有笔记及正文工具。read openNote=true 可打开关联笔记。",
  exportImage: "read format=image 打开原生导出窗口，需用户确认导出。",
  saveAsDefault:
    "configure saveAsDefault=true 必须单独一批，仅在用户明确要求时保存本机默认主题与布局。",
};

export function mindFieldValue(
  page: WhiteboardPageSnapshot,
  id: string,
  field: MindField,
  index = mindIndex(page)
): unknown {
  const node = index.nodes.get(id);
  if (!node) return null;
  const structure = (entry: WhiteboardElementSnapshot): unknown => ({
    id: entry.id,
    type: entry.type,
    contractId: entry.contractId,
    direction: entry.data.direction ?? null,
    layout: entry.data.layout ?? null,
    summaryRange: entry.data.summaryRange ?? null,
    source: entry.data.source ?? null,
    target: entry.data.target ?? null,
    boundaries: Array.isArray(entry.data.boundaries)
      ? entry.data.boundaries.map(value => {
          const range = mindRange(value);
          return {
            ...range,
            id: value && typeof value === "object" && "id" in value ? value.id : null,
          };
        })
      : [],
    children: entry.children.map(child => ({
      id: child.id,
      type: child.type,
      contractId: child.contractId,
      direction: child.data.direction ?? null,
      summaryRange: child.data.summaryRange ?? null,
    })),
  });
  const folding = (entry: WhiteboardElementSnapshot): unknown => ({
    id: entry.id,
    left: entry.data.isLeftFold ?? false,
    right: entry.data.isRightFold ?? false,
    children: entry.children.map(folding),
  });
  if (field === "structure")
    return { parentId: index.parents.get(id)?.id ?? page.id, tree: structure(node) };
  if (field === "text") return node.body ?? null;
  if (field === "fold") return folding(node);
  if (field === "note")
    return { entity: node.entity ?? null, title: node.data.contentTitle ?? null };
  if (field === "position")
    return {
      geometry: node.geometry,
      points: node.data.points ?? null,
      midPoint: node.data.midPoint ?? null,
    };
  if (field === "boundaries") return node.data.boundaries ?? [];
  if (field === "style")
    return {
      style: node.style,
      data: Object.fromEntries(
        [
          "layout",
          "themeId",
          "themeStyle",
          "theme",
          "background",
          "border",
          "textColor",
          "lineType",
          "lineWidth",
          "themeColorId",
          "dashed",
          "dashArray",
          "animated",
          "animationSpeed",
        ].map(key => [key, node.data[key] ?? null])
      ),
    };
  const ids = new Set(pageElements([node]).map(child => child.id));
  return {
    node,
    parentId: index.parents.get(id)?.id ?? page.id,
    relations: [...index.nodes.values()].filter(
      item =>
        item.type === "arrow" &&
        [endpointId(item.data.source), endpointId(item.data.target)].some(
          end => end && ids.has(end)
        )
    ),
  };
}

export async function mindPreconditions(
  page: WhiteboardPageSnapshot,
  ids: readonly string[]
): Promise<MindPrecondition[]> {
  const index = mindIndex(page);
  return Promise.all(
    [...new Set(ids)].map(async id => {
      const values = await Promise.all(
        mindFields.map(async field => {
          const input = new TextEncoder().encode(
            canonicalContractJson(mindFieldValue(page, id, field, index))
          );
          const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
          return [
            field,
            Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join(""),
          ] as const;
        })
      );
      return { id, ...Object.fromEntries(values) } as MindPrecondition;
    })
  );
}
