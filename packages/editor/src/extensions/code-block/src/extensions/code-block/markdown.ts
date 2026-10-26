import { v4 as uuid } from "uuid";
import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";
import { normalizeCodeBlockLanguageDisplayName } from "@tau/shared/code-block-language";
import type { CodeBlockV2Element, CodeStepElement } from "../../types";
import { normalizeCodeBlockFilename } from "./utils/filename.ts";

const MAGIC_MOVE_META_PREFIX = "smm=";
const TITLE_META_REGEX = /(?:^|\s)title="([^"]*)"/;
const WRAP_META_TOKEN = "wrap";
const NO_LINE_NUMBERS_META_TOKEN = "noLineNumbers";

interface DisplayMeta {
  filename?: string;
  wrap: boolean;
  lineNumbers?: false;
  /** 去掉 title 后的其余 meta，避免文件名里的 `{1}`、`smm=` 被误认 */
  rest: string;
}

const parseDisplayMeta = (meta: unknown): DisplayMeta => {
  if (typeof meta !== "string" || !meta.trim()) return { wrap: false, rest: "" };
  const titleMatch = meta.match(TITLE_META_REGEX);
  const rest = titleMatch ? meta.replace(titleMatch[0], " ") : meta;
  const tokens = rest.split(/\s+/);
  return {
    filename: normalizeCodeBlockFilename(titleMatch?.[1]),
    wrap: tokens.includes(WRAP_META_TOKEN),
    ...(tokens.includes(NO_LINE_NUMBERS_META_TOKEN) ? { lineNumbers: false as const } : {}),
    rest,
  };
};

const createDisplayMeta = (element: any): string[] => {
  const filename = normalizeCodeBlockFilename(element.filename);
  return [
    filename ? `title="${filename}"` : "",
    element.wrap === true ? WRAP_META_TOKEN : "",
    element.lineNumbers === false ? NO_LINE_NUMBERS_META_TOKEN : "",
  ];
};

interface MagicMoveStep {
  id: string;
  title?: string;
  code: string;
  highlightLines?: string;
}

interface MagicMovePayload {
  v: 1;
  activeStep: number;
  steps: MagicMoveStep[];
}

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const withPadding = padding === 0 ? normalized : `${normalized}${"=".repeat(4 - padding)}`;
  const binary = atob(withPadding);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const HIGHLIGHT_META_REGEX = /\{([\d,\-\s]+)\}/;

const parseHighlightMeta = (meta: unknown): string | undefined => {
  if (typeof meta !== "string" || !meta.trim()) return undefined;
  const match = meta.match(HIGHLIGHT_META_REGEX);
  if (!match) return undefined;
  return normalizeHighlightLines(match[1]);
};

const parseMagicMoveMeta = (meta: unknown): MagicMovePayload | undefined => {
  if (typeof meta !== "string" || !meta.trim()) {
    return undefined;
  }

  const token = meta.split(/\s+/).find(item => item.startsWith(MAGIC_MOVE_META_PREFIX));
  if (!token) {
    return undefined;
  }

  try {
    const encoded = token.slice(MAGIC_MOVE_META_PREFIX.length);
    const parsed: unknown = JSON.parse(decodeBase64Url(encoded));
    const parsedRecord =
      typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    const parsedSteps = parsedRecord?.steps;
    if (
      !parsedRecord ||
      parsedRecord.v !== 1 ||
      !Array.isArray(parsedSteps) ||
      parsedSteps.length < 1
    ) {
      return undefined;
    }

    const steps = parsedSteps.map((step: unknown, index: number) => {
      const stepRecord =
        typeof step === "object" && step !== null ? (step as Record<string, unknown>) : {};
      return {
        id:
          typeof stepRecord.id === "string" && stepRecord.id.trim()
            ? stepRecord.id.trim()
            : `step-${index + 1}`,
        title: typeof stepRecord.title === "string" ? stepRecord.title : undefined,
        code: typeof stepRecord.code === "string" ? stepRecord.code : "",
        highlightLines: normalizeHighlightLines(stepRecord.highlightLines),
      };
    });

    if (steps.length < 1) {
      return undefined;
    }

    const activeStep = Math.min(
      Math.max(Number(parsedRecord.activeStep) || 0, 0),
      steps.length - 1
    );

    return { v: 1, activeStep, steps };
  } catch {
    return undefined;
  }
};

const normalizeHighlightLines = (highlightLines: unknown): string | undefined => {
  if (typeof highlightLines !== "string" || !highlightLines.trim()) return undefined;
  const normalized = highlightLines
    .trim()
    .replace(/\s*,\s*/g, ",")
    .replace(/\s*-\s*/g, "-");
  if (!/^[\d,\-]+$/.test(normalized)) return undefined;
  return normalized;
};

const encodeBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const createHighlightMeta = (highlightLines: string | undefined): string => {
  const normalized = normalizeHighlightLines(highlightLines);
  if (!normalized) return "";
  return `{${normalized}}`;
};

const createMagicMoveMeta = (magicMove: any): string => {
  if (
    !magicMove ||
    magicMove.v !== 1 ||
    !Array.isArray(magicMove.steps) ||
    magicMove.steps.length < 1
  ) {
    return "";
  }

  const steps = magicMove.steps
    .map((step: any, index: number) => ({
      id: typeof step?.id === "string" && step.id.trim() ? step.id.trim() : `step-${index + 1}`,
      title: typeof step?.title === "string" ? step.title : undefined,
      code: typeof step?.code === "string" ? step.code : "",
      highlightLines: normalizeHighlightLines(step?.highlightLines),
    }))
    .filter((step: any) => typeof step.code === "string");

  if (steps.length < 1) {
    return "";
  }

  const activeStep = Math.min(Math.max(Number(magicMove.activeStep) || 0, 0), steps.length - 1);

  return `${MAGIC_MOVE_META_PREFIX}${encodeBase64Url(
    JSON.stringify({ v: 1 as const, activeStep, steps })
  )}`;
};

/** 魔法移动时导出当前激活步的代码 */
const resolveActiveCode = (element: any): { code: string; fence: string } => {
  const language = element.language || "";
  const magicMove = element.magicMove;
  const hasMagicMove =
    magicMove && magicMove.v === 1 && Array.isArray(magicMove.steps) && magicMove.steps.length > 0;
  const activeStep = hasMagicMove
    ? magicMove.steps[
        Math.min(Math.max(Number(magicMove.activeStep) || 0, 0), magicMove.steps.length - 1)
      ]
    : undefined;
  const code = element.code ?? activeStep?.code ?? "";
  const magicMoveMeta = createMagicMoveMeta(magicMove);
  const highlightMeta = createHighlightMeta(activeStep?.highlightLines ?? element.highlightLines);
  const fence = [language, ...createDisplayMeta(element), highlightMeta, magicMoveMeta]
    .filter(Boolean)
    .join(" ");
  return { code, fence };
};

export const codeBlockCodec: MarkdownCodec = {
  type: "code-block",
  dataVersion: 1,
  isVoid: true,
  // 围栏语言先被 fence 声明认领，这里兜底剩下的 code 节点（无语言 / 未知语言 / 缩进代码块）
  importNode: node => {
    if (node.type !== "code") return null;
    const source = node.value ?? "";
    const { rest: meta, filename, wrap, lineNumbers } = parseDisplayMeta(node.meta);
    const magicMove = parseMagicMoveMeta(meta);
    let highlightLines = parseHighlightMeta(meta);
    if (magicMove) {
      const safeStep = Math.min(
        Math.max(Number(magicMove.activeStep) || 0, 0),
        magicMove.steps.length - 1
      );
      const activeStep = magicMove.steps[safeStep];
      if (activeStep) {
        if (!activeStep.highlightLines && highlightLines) {
          activeStep.highlightLines = highlightLines;
        }
        highlightLines = activeStep.highlightLines ?? highlightLines;
      }
    }
    return {
      type: "code-block",
      language: normalizeCodeBlockLanguageDisplayName(node.lang),
      code: source,
      uuid: uuid(),
      ...(magicMove ? { magicMove } : {}),
      ...(highlightLines ? { highlightLines } : {}),
      ...(filename ? { filename } : {}),
      ...(wrap ? { wrap } : {}),
      ...(lineNumbers === false ? { lineNumbers } : {}),
      children: [{ type: "formatted", text: "" }],
    } as Descendant;
  },
  fenceSourceProperty: "code",
  serializer: {
    isBlock: true,
    toMarkdown: element => {
      const { code, fence } = resolveActiveCode(element);
      return codeFence(code, fence);
    },
    toMarkdownStructured: element => {
      const { code, fence } = resolveActiveCode(element);
      return {
        output: codeFence(code, fence),
        skipChildren: true,
        propertyMappings: {
          code: {
            start: { line: 1, ch: 0 },
            multiline: true,
          },
        },
      };
    },
  },
};

function codeFence(code: string, meta: string): string {
  const length = Math.max(3, ...Array.from(code.matchAll(/`+/g), match => match[0].length + 1));
  const fence = "`".repeat(length);
  return `${fence}${meta}\n${code}\n${fence}`;
}

function exportCodeSteps(element: CodeBlockV2Element): string {
  if (
    !element.children.length ||
    element.children.some(step => step.type !== "code-step" || typeof step.code !== "string")
  ) {
    throw new Error("代码步骤格式无效，须使用保真导出");
  }
  const steps = element.children.map((step, index) => ({
    ...(index ? { code: step.code } : {}),
    ...(step.title === undefined ? {} : { title: step.title }),
    ...(step.highlightLines === undefined ? {} : { highlightLines: step.highlightLines }),
  }));
  const extra = steps.length > 1 || steps[0].title !== undefined;
  const metadata = [
    element.language || "",
    ...createDisplayMeta(element),
    createHighlightMeta(element.children[0].highlightLines),
    extra ? `${MAGIC_MOVE_META_PREFIX}${encodeBase64Url(JSON.stringify({ v: 2, steps }))}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return codeFence(element.children[0].code, metadata);
}

/** 标准 Markdown 重新导入当前版本；完整契约与未知属性由 Tau 无损载荷保留。 */
export const codeBlockV2Codec: MarkdownCodec = {
  type: "code-block",
  dataVersion: 2,
  isVoid: true,
  importNode: node => {
    if (node.type !== "code") return null;
    const display = parseDisplayMeta(node.meta);
    const token = display.rest.split(/\s+/).find(item => item.startsWith(MAGIC_MOVE_META_PREFIX));
    let payload: Record<string, unknown> | undefined;
    if (token) {
      const parsed: unknown = JSON.parse(
        decodeBase64Url(token.slice(MAGIC_MOVE_META_PREFIX.length))
      );
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("代码步骤载荷无效");
      payload = parsed as Record<string, unknown>;
      if (payload.v !== 2) throw new Error("不支持此代码步骤版本，请保留原文件");
    }
    if (!payload) {
      const highlightLines = parseHighlightMeta(display.rest);
      payload = { v: 2, steps: [{ ...(highlightLines ? { highlightLines } : {}) }] };
    }
    if (!Array.isArray(payload.steps) || !payload.steps.length) throw new Error("代码步骤列表无效");
    const steps = payload.steps.map((value, index): CodeStepElement => {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("代码步骤无效");
      const step = value as Record<string, unknown>;
      if (
        (!index && step.code !== undefined) ||
        (index && typeof step.code !== "string") ||
        (step.title !== undefined && typeof step.title !== "string") ||
        (step.highlightLines !== undefined && typeof step.highlightLines !== "string")
      )
        throw new Error("代码步骤源码或属性无效");
      return {
        type: "code-step",
        code: index ? (step.code as string) : (node.value ?? ""),
        ...(step.title === undefined ? {} : { title: step.title as string }),
        ...(step.highlightLines === undefined
          ? {}
          : { highlightLines: step.highlightLines as string }),
        children: [{ type: "formatted", text: "" }],
      };
    });
    return {
      type: "code-block",
      language: normalizeCodeBlockLanguageDisplayName(node.lang),
      uuid: uuid(),
      ...(display.filename ? { filename: display.filename } : {}),
      ...(display.wrap ? { wrap: true } : {}),
      ...(display.lineNumbers === false ? { lineNumbers: false } : {}),
      children: steps,
    } as CodeBlockV2Element;
  },
  serializer: {
    isBlock: true,
    toMarkdown: exportCodeSteps,
    toMarkdownStructured: element => ({ output: exportCodeSteps(element), skipChildren: true }),
  },
};
