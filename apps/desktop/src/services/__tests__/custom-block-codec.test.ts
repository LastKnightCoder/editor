import { expect, it } from "vitest";
import { createEditorKit } from "@tau/editor";
import { createMarkdownProcessor } from "@tau/markdown";
import { customBlockDefinition, customBlockExtension } from "../../test-fixtures/plugin-packages";

it("发布包注册拖拽、HTML 转义与 Markdown 往返", () => {
  const kit = createEditorKit({ extensions: [customBlockExtension] });
  expect(kit.assembly.dragSpecs.get("custom-block")).toEqual({ self: true, children: true });
  expect(
    customBlockExtension.htmlSerializers![0].toHtml({ content: '<div title="示例">&</div>' })
  ).toBe(
    '<div class="plugin-source-block"><pre><code>&lt;div title=&quot;示例&quot;&gt;&amp;&lt;/div&gt;</code></pre></div>'
  );
  const md = createMarkdownProcessor({ codecs: [...(customBlockDefinition.editorCodecs ?? [])] });
  const source = "```custom-block\nconst Component = () => <div>内容</div>;\n```";
  const imported = md.importFromMarkdownWithPositions(source);
  expect(md.getMarkdown(imported.content).trim()).toBe(source);
  expect(md.getMarkdownWithPositions(imported.content).markdown.trim()).toBe(source);
});
