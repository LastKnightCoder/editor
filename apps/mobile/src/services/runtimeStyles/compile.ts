import { parse } from "@babel/parser";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";
import { compile } from "tailwindcss";
import theme from "tailwindcss/theme.css?raw";
import utilities from "tailwindcss/utilities.css?raw";
import semanticTheme from "@tau/themes/tailwind.css?raw";
import type { RuntimeStyleRequest } from "@tau/shared/runtime-style";

export function extractStyleCandidates({ source, language }: RuntimeStyleRequest): string[] {
  if (source.length > 1024 * 1024) throw new Error("样式源码超过 1 MiB");
  const candidates = new Set<string>();
  const add = (value: string) => {
    for (const token of value.split(/\s+/)) if (token) candidates.add(token);
  };
  if (language === "html") {
    const walk = (node: DefaultTreeAdapterTypes.Node) => {
      if ("attrs" in node)
        for (const attr of node.attrs) if (attr.name === "class") add(attr.value);
      if ("childNodes" in node) node.childNodes.forEach(walk);
      if ("content" in node) walk(node.content);
    };
    walk(parseFragment(source));
  } else if (language === "tsx") {
    const tree = parse(source, {
      sourceType: "unambiguous",
      plugins: ["jsx", "typescript"],
      allowReturnOutsideFunction: true,
    });
    const stack: unknown[] = [tree];
    while (stack.length) {
      const value = stack.pop();
      if (!value || typeof value !== "object") continue;
      const node = value as { type?: string; value?: unknown };
      if (node.type === "StringLiteral" && typeof node.value === "string") add(node.value);
      if (node.type === "TemplateElement") add((node.value as { raw: string }).raw);
      for (const child of Object.values(value))
        if (child && typeof child === "object") stack.push(child);
    }
  } else throw new Error("样式源码语言无效");
  return [...candidates];
}

/** 只解析静态类名，不执行 HTML/TSX，也不读取远端样式或本机文件。 */
export async function compileRuntimeStyles(request: RuntimeStyleRequest): Promise<string> {
  const candidates = extractStyleCandidates(request);
  if (!candidates.length) return "";
  const stylesheets: Record<string, string> = {
    "tailwindcss/theme": theme,
    "tailwindcss/utilities": utilities,
  };
  const builder = await compile(
    `@layer theme, base, components, utilities;
@import "tailwindcss/theme" layer(theme);
@import "tailwindcss/utilities" layer(utilities);
${semanticTheme}
@custom-variant dark (.dark &);`,
    {
      loadStylesheet: async id => {
        if (!Object.hasOwn(stylesheets, id)) throw new Error("不支持外部样式依赖");
        return { path: id, base: "", content: stylesheets[id] };
      },
    }
  );
  return builder.build(candidates);
}
