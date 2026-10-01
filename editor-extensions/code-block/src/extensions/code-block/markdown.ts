import { v4 as uuid } from "uuid";
import type { Descendant } from "slate";
import type { MarkdownCodec } from "@tau/markdown";
import { normalizeCodeBlockLanguageDisplayName } from "@tau/shared/code-block-language";

const MAGIC_MOVE_META_PREFIX = "smm=";

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

const parseMagicMoveMeta = (meta: unknown, fallbackCode: string): MagicMovePayload | undefined => {
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
    // 围栏里的源码就是激活步的最新内容，覆盖载荷里的旧值
    steps[activeStep].code = fallbackCode;

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
  const code = activeStep?.code ?? element.code ?? "";
  const magicMoveMeta = createMagicMoveMeta(magicMove);
  const highlightMeta = createHighlightMeta(activeStep?.highlightLines ?? element.highlightLines);
  const fence = [language, highlightMeta, magicMoveMeta].filter(Boolean).join(" ");
  return { code, fence };
};

export const codeBlockCodec: MarkdownCodec = {
  type: "code-block",
  isVoid: true,
  // 围栏语言先被 fence 声明认领，这里兜底剩下的 code 节点（无语言 / 未知语言 / 缩进代码块）
  importNode: node => {
    if (node.type !== "code") return null;
    const source = node.value ?? "";
    const magicMove = parseMagicMoveMeta(node.meta, source);
    let highlightLines = parseHighlightMeta(node.meta);
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
      children: [{ type: "formatted", text: "" }],
    } as Descendant;
  },
  fenceSourceProperty: "code",
  serializer: {
    isBlock: true,
    toMarkdown: element => {
      const { code, fence } = resolveActiveCode(element);
      return "```" + fence + "\n" + code + "\n```";
    },
    toMarkdownStructured: element => {
      const { code, fence } = resolveActiveCode(element);
      return {
        output: "```" + fence + "\n" + code + "\n```",
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
