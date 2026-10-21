import type { MarkdownTextCodec } from "@tau/markdown";
import { isTextGradientPresetId } from "./text-gradient.ts";
import { TEXT_FORMATTING_KEYS } from "./types.ts";

export const textFormattingCodec: MarkdownTextCodec = {
  id: "tau.text-formatting",
  keys: TEXT_FORMATTING_KEYS,
  importRules: [
    {
      nodeType: "strong",
      content: "children",
      position: "self",
      readMarks: () => ({ bold: true }),
    },
    {
      nodeType: "emphasis",
      content: "children",
      position: "self",
      readMarks: () => ({ italic: true }),
    },
    {
      nodeType: "delete",
      content: "children",
      position: "self",
      readMarks: () => ({ strikethrough: true }),
    },
    { nodeType: "inlineCode", content: "value", readMarks: () => ({ code: true }) },
    {
      nodeType: "textDirective",
      directive: "color",
      content: "children",
      position: "inherit",
      readMarks: node => ({
        color: node.attributes?.color || "",
        darkColor: node.attributes?.darkColor || "",
      }),
    },
    {
      nodeType: "textDirective",
      directive: "gradient",
      content: "children",
      position: "inherit",
      readMarks: node => {
        const preset = node.attributes?.preset;
        return isTextGradientPresetId(preset) ? { textGradient: preset } : {};
      },
    },
    {
      nodeType: "textDirective",
      directive: "highlight",
      content: "children",
      position: "inherit",
      readMarks: node => ({ highlight: node.attributes?.color || "yellow" }),
    },
  ],
  exportWrap: leaf => {
    for (const key of ["bold", "italic", "underline", "strikethrough", "code"] as const) {
      if (leaf[key] !== undefined && typeof leaf[key] !== "boolean")
        throw new Error(`非法文本标记：${key}`);
    }
    if (leaf.textGradient && !isTextGradientPresetId(leaf.textGradient))
      throw new Error("非法渐变标记");
    for (const value of [
      leaf.color,
      leaf.darkColor,
      typeof leaf.highlight === "string" ? leaf.highlight : undefined,
    ]) {
      if (value !== undefined && (typeof value !== "string" || /[\s"'{}\\&<>]/.test(value)))
        throw new Error("文本属性无法安全写入既有指令");
    }
    if (
      leaf.highlight !== undefined &&
      typeof leaf.highlight !== "boolean" &&
      typeof leaf.highlight !== "string"
    )
      throw new Error("非法高亮标记");
    let prefix = "";
    let suffix = "";
    const wrap = (before: string, after = before) => {
      prefix = before + prefix;
      suffix += after;
    };
    if (leaf.code) wrap("`");
    if (leaf.italic) wrap("*");
    if (leaf.strikethrough) wrap("~~");
    if (leaf.bold) wrap("**");
    if (leaf.textGradient) wrap(":gradient[", `]{preset=${leaf.textGradient}}`);
    else if (leaf.color && leaf.darkColor)
      wrap(":color[", `]{color=${leaf.color} darkColor=${leaf.darkColor}}`);
    // 布尔高亮与渲染口径一致，按默认黄色导出
    if (leaf.highlight)
      wrap(":highlight[", `]{color=${leaf.highlight === true ? "yellow" : leaf.highlight}}`);
    return { prefix, suffix };
  },
};
