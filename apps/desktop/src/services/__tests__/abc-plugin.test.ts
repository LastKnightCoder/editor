// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import { createMarkdownProcessor } from "@tau/markdown";
import { ContentPluginRegistry, createPluginMarkdownProcessor } from "@tau/plugins/content";
import { assertDesktopPluginCompatibility as assertPluginCompatibility } from "../../../shared/plugin-package";
import { diagramMarkdownCodecs } from "@tau/editor/extensions/diagram/markdown";
import { evaluatePluginFixture, pluginArtifact } from "../../test-fixtures/plugin-packages";

const artifact = pluginArtifact("tau.abc");
const definition = evaluatePluginFixture(artifact);
const registry = new ContentPluginRegistry();
afterEach(() => registry.install([]));

describe("ABC 真实插件包", () => {
  it("无 DOM 求值，声明编辑、拖拽、源码导出及使用 Skill", () => {
    expect(typeof document).toBe("undefined");
    expect(definition.id).toBe("tau.abc");
    const extension = definition.editorExtensions![0];
    expect(extension.elements![0]).toMatchObject({ type: "abc", drag: true, isVoid: true });
    expect(extension.blockPanel).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "音乐标注" })])
    );
    expect(extension.htmlSerializers![0].toHtml({ content: "<script>&</script>" })).toContain(
      "&lt;script&gt;&amp;&lt;/script&gt;"
    );
    expect(() => assertPluginCompatibility(artifact.manifest, "0.58.0")).toThrow(/插件需要 Tau/);
    expect(() => assertPluginCompatibility(artifact.manifest, "0.59.0")).not.toThrow();
  });

  it.each(["X:1\nK:C\nC D E F |", "X:1\nT:中文\n% ``` 原始注释\n\nK:C\nG A B c |"])(
    "插件启用后普通和带位置 Markdown 往返保留源码：%s",
    source => {
      registry.install([definition]);
      const processor = createPluginMarkdownProcessor({ codecs: diagramMarkdownCodecs }, registry);
      const value = [
        { type: "abc", content: source, children: [{ type: "formatted", text: "" }] },
      ] as unknown as Descendant[];
      const markdown = processor.getMarkdown(value);
      expect(processor.importFromMarkdown(markdown)).toEqual(value);
      expect(processor.importFromMarkdownWithPositions(markdown).content).toEqual(value);
      expect(processor.getMarkdownWithPositions(value).markdown).toBe(markdown);
    }
  );

  it("停用后未知节点走 JSON 保真，重新装配恢复 ABC codec", () => {
    const processor = createPluginMarkdownProcessor({}, registry);
    const value = [
      { type: "abc", content: "X:1\nK:C\nC", children: [{ type: "formatted", text: "" }] },
    ] as unknown as Descendant[];
    const preserved = processor.getMarkdown(value);
    expect(preserved).toContain("tau-node");
    expect(processor.importFromMarkdown(preserved)).toEqual(value);
    registry.install([definition]);
    expect(processor.getMarkdown(value)).toContain("```abc");
    registry.install([]);
    expect(processor.getMarkdown(value)).toBe(preserved);
    expect(registry.htmlSerializer("abc")).toBeUndefined();
  });

  it("内置处理器不再认领 ABC 围栏，仍保留普通代码文本", () => {
    expect(diagramMarkdownCodecs.some(codec => codec.type === "abc")).toBe(false);
    const markdown = "```abc\nX:1\nK:C\nC\n```";
    const processor = createMarkdownProcessor({ codecs: diagramMarkdownCodecs });
    expect(processor.importFromMarkdown(markdown)[0].type).not.toBe("abc");
  });
});
