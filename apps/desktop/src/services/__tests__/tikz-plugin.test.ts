// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { evaluatePluginPackage } from "@tau/plugins/rendering";
import { sharedPluginModules } from "@tau/plugins/shared-modules";
import { pluginArtifact } from "../../test-fixtures/plugin-packages";

describe("TikZ 真实发布包的纯转换", () => {
  it("无 DOM 求值同一入口，Markdown 往返和 HTML 源码导出不执行编译器", () => {
    expect(typeof document).toBe("undefined");
    const definition = evaluatePluginPackage(pluginArtifact("tau.tikz"), sharedPluginModules);
    expect(definition.id).toBe("tau.tikz");
    const extension = definition.editorExtensions![0];
    expect(extension.elements![0]).toMatchObject({ type: "tikz", drag: true, isVoid: true });
    const processor = createMarkdownProcessor({ codecs: [...(definition.editorCodecs ?? [])] });
    const source =
      "\\begin{tikzpicture}\n  % 原始注释\n\n  \\draw (0,0)--(1,1);\n\\end{tikzpicture}";
    const markdown = "```tikz\n" + source + "\n```";
    const parsed = processor.importFromMarkdownWithPositions(markdown);
    expect(parsed.content[0]).toMatchObject({ type: "tikz", content: source });
    expect(processor.getMarkdown(parsed.content).trim()).toBe(markdown);
    expect(processor.getMarkdownWithPositions(parsed.content).markdown.trim()).toBe(markdown);
    const html = extension.htmlSerializers![0].toHtml({ content: "<script>&</script>" });
    expect(html).toContain("&lt;script&gt;&amp;&lt;/script&gt;");
    expect(definition.skills![0].content).toContain("```tikz");
    expect(definition).not.toHaveProperty("tikzCompiler");
  });
});
