import { expect, it } from "vitest";
import { createEditorKit } from "@tau/editor";
import { customBlockExtension } from "../index";

it("自定义预览块注册拖拽源与放置目标", () => {
  const kit = createEditorKit({ extensions: [customBlockExtension] });
  expect(kit.assembly.dragSpecs.get("custom-block")).toEqual({ self: true, children: true });
});

it("静态导出保留源码而不执行，并转义 HTML", () => {
  const serializer = customBlockExtension.htmlSerializers![0];
  expect(serializer.toHtml({ content: '<div title="示例">&</div>' })).toBe(
    '<div class="plugin-source-block"><pre><code>&lt;div title=&quot;示例&quot;&gt;&amp;&lt;/div&gt;</code></pre></div>'
  );
});
