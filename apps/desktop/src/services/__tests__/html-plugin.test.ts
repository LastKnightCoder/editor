import { afterEach, expect, it, vi } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { textFormattingCodec } from "@tau/editor/extensions/text-formatting/markdown";
import { desktopCodecComposition } from "../../utils/markdown";
import { desktopContentPlugins } from "../../../shared/content-plugins";
import { htmlDefinition, htmlExtension } from "../../test-fixtures/plugin-packages";
import { HtmlSerializerRegistry } from "../../utils/htmlSerializerRegistry";

const compile = vi.hoisted(() => vi.fn(async () => ".p-4{padding:1rem}"));
vi.mock("../../utils/html-serializers/tailwind-compiler", () => ({
  compileTailwindForHtml: compile,
}));
afterEach(() => {
  desktopContentPlugins.install([]);
  vi.clearAllMocks();
});

it("一个真实包声明行内、块级、样式来源和拖拽", () => {
  expect(htmlDefinition.id).toBe("tau.html");
  expect(htmlExtension.elements?.map(spec => [spec.type, spec.kind, spec.drag])).toEqual([
    ["html-block", "block", true],
    ["html-inline", "inline", undefined],
  ]);
  expect(htmlExtension.styleSources?.map(source => source.type)).toEqual([
    "html-block",
    "html-inline",
  ]);
  expect(htmlDefinition.skills?.[0].content).toContain("html-inline");
});

it.each(['<div class="p-4">块级内容</div>', "前面 <b>行内内容</b> 后面"])(
  "真实 codec 保留 Markdown 与位置往返：%s",
  source => {
    const md = createMarkdownProcessor({
      codecs: [...desktopCodecComposition, ...htmlDefinition.editorCodecs!],
      textCodecs: [textFormattingCodec],
    });
    const parsed = md.importFromMarkdownWithPositions(source);
    expect(md.getMarkdown(parsed.content).trim()).toBe(source);
    expect(md.getMarkdownWithPositions(parsed.content).markdown.trim()).toBe(source);
  }
);

it("静态导出按通用 styleSources 收集两类节点的 CSS", async () => {
  desktopContentPlugins.install([htmlDefinition]);
  const registry = new HtmlSerializerRegistry();
  const css: string[] = [];
  for (const type of ["html-block", "html-inline"]) {
    const source = `<span class="p-4">${type}</span>`;
    const html = await registry.serializeAsync(
      [{ type, html: source, children: [{ type: "formatted", text: "" }] }] as never,
      { tailwindCssCollector: css }
    );
    expect(html).toBe(source);
    expect(compile).toHaveBeenCalledWith(source, "html");
  }
  expect(css).toEqual([".p-4{padding:1rem}", ".p-4{padding:1rem}"]);
});
