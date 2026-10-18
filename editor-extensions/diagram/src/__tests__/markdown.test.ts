// @vitest-environment node
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { diagramMarkdownCodecs } from "../../markdown";

const md = createMarkdownProcessor({ codecs: diagramMarkdownCodecs });
const cases = [
  ["mermaid", "chart", "graph TD\nA --> B"],
  ["abc", "content", "X: 1\nK: C\nC D E F"],
  ["plantuml", "content", "@startuml\nAlice -> Bob\n@enduml"],
  ["typst", "content", "= 标题\n正文"],
] as const;

describe("图表扩展 headless codec", () => {
  it.each(cases)("%s 源码围栏普通和带位置往返", (type, field, source) => {
    const markdown = "```" + type + "\n" + source + "\n```";
    const imported = md.importFromMarkdownWithPositions(markdown);
    expect(imported.content[0]).toMatchObject({ type, [field]: source });
    expect(md.getMarkdown(imported.content).trim()).toBe(markdown);
    expect(md.getMarkdownWithPositions(imported.content).markdown.trim()).toBe(markdown);
    expect(md.importFromMarkdown(markdown)).toEqual(imported.content);
  });

  it("只覆盖内置四类，TikZ 由独立插件提供", () => {
    expect(diagramMarkdownCodecs.map(codec => codec.type).sort()).toEqual([
      "abc",
      "mermaid",
      "plantuml",
      "typst",
    ]);
  });

  it("Node 包名加载与往返，加载图拒绝 React/DOM/图表渲染器", () => {
    const script = `
      import { registerHooks } from 'node:module';
      registerHooks({ resolve(specifier, context, next) {
        if (/^(react(?:-dom)?(?:\\/|$)|slate-(?:react|dom)|@babel\\/|abcjs$|mermaid$|plantuml-encoder$|@tau\\/(?:editor$|editor\\/api|ui))/.test(specifier))
          throw new Error('禁止 headless 加载 ' + specifier);
        return next(specifier, context);
      }});
      const { diagramMarkdownCodecs } = await import('@tau/editor-diagram/markdown');
      const { createMarkdownProcessor } = await import('@tau/markdown');
      const md = createMarkdownProcessor({ codecs: diagramMarkdownCodecs });
      const fence = String.fromCharCode(96).repeat(3);
      const source = fence + 'mermaid\\ngraph TD\\nA --> B\\n' + fence;
      console.log(JSON.stringify([typeof document, typeof React, md.getMarkdown(md.importFromMarkdown(source)).trim()]));
    `;
    const output = execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script],
      { cwd: import.meta.dirname, encoding: "utf8" }
    );
    expect(JSON.parse(output)).toEqual([
      "undefined",
      "undefined",
      "```mermaid\ngraph TD\nA --> B\n```",
    ]);
  });
});
