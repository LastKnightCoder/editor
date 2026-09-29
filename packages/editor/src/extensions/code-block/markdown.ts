import type { MarkdownCodec } from "@tau/markdown";

const MAGIC_MOVE_META_PREFIX = "smm=";

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
