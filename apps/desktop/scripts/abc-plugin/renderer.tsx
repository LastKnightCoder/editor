import { createRoot } from "react-dom/client";
import { UiProvider } from "@tau/ui";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Transforms, type Descendant, type Editor as SlateEditor } from "slate";
import { Editor } from "@tau/editor";
import { evaluatePluginPackage } from "@tau/plugins/rendering";
import type { DevelopmentPluginPackage } from "@tau/plugins/package";
import { sharedPluginModules } from "../../src/app/plugins/shared-modules";
import { desktopContentPlugins } from "../../shared/content-plugins";
import { createDesktopKit } from "../../src/services/editorKit";
import { loadPublishedPlugins } from "../../../blog/src/services/plugin-runtime";
import { getBlogKit } from "../../../blog/src/services/editorKit";
import { importFromMarkdown, getMarkdown } from "../../src/utils/markdown";
import { htmlSerializerRegistry } from "../../src/utils/html-serializers";

const fixture = (
  window as unknown as {
    abcFixture: {
      phase: string;
      artifact: DevelopmentPluginPackage;
      enabled: boolean;
      baseUrl: string;
    };
  }
).abcFixture;
const source = "X:1\nT:原始乐谱\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |";
const value = [
  { type: "abc", content: source, children: [{ type: "formatted", text: "" }] },
] as unknown as Descendant[];
const host = document.getElementById("root")!;
const root = createRoot(host);
const svg = () => host.querySelector("[data-tau-abc-preview] svg");
const check = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
async function until(read: () => unknown, message: string) {
  const deadline = Date.now() + 15_000;
  while (!read()) {
    if (Date.now() > deadline) throw new Error(message + ": " + host.textContent?.slice(-600));
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function verify() {
  const definition = evaluatePluginPackage(fixture.artifact, sharedPluginModules);
  desktopContentPlugins.install(fixture.enabled ? [definition] : []);
  const kit = createDesktopKit();
  check(kit.elementTypes.includes("abc") === fixture.enabled, "ABC 装配状态不正确");
  let editor: SlateEditor | undefined;
  const show = (content: Descendant[], targetKit = kit, readonly = true) => {
    root.render(
      <UiProvider>
        <DndProvider backend={HTML5Backend}>
          <Editor
            key={JSON.stringify(content) + readonly}
            kit={targetKit}
            initValue={content}
            readonly={readonly}
            onInit={current => {
              editor = current;
            }}
          />
        </DndProvider>
      </UiProvider>
    );
  };
  if (!fixture.enabled) {
    show(
      [...value, { type: "paragraph", children: [{ type: "formatted", text: "邻接正文" }] }],
      kit,
      false
    );
    await until(() => editor, "未知节点编辑器未初始化");
    const before = JSON.stringify(editor!.children[0]);
    Transforms.insertText(editor!, "更新", { at: { path: [1, 0], offset: 0 } });
    check(JSON.stringify(editor!.children[0]) === before, "未知 ABC 节点被改写");
    const preserved = getMarkdown(editor!.children);
    check(preserved.includes("tau-node"), "缺包时未使用保真载体");
    check(
      JSON.stringify(importFromMarkdown(preserved)[0]) === before,
      "缺包 Markdown 往返丢失数据"
    );
    const html = await htmlSerializerRegistry.serializeAsync(value);
    check(html.includes(source) && !html.includes("<svg"), "缺包 HTML 未保留源码");
    root.unmount();
    return {
      ok: true,
      phase: fixture.phase,
      cases: ["unknown-data-preserved", "missing-markdown", "source-export"],
    };
  }
  check(kit.assembly.dragSpecs.get("abc")?.self, "插件节点缺少拖拽声明");
  const markdown = "```abc\n" + source + "\n```";
  const parsed = importFromMarkdown(markdown);
  check(getMarkdown(parsed).trim() === markdown, "ABC Markdown 往返失败");
  show(parsed, kit, false);
  await until(() => svg()?.querySelector("path"), "桌面乐谱没有 SVG 路径");
  check(JSON.stringify(editor!.children) === JSON.stringify(parsed), "初次渲染改写文档");
  document.dispatchEvent(new CustomEvent("preview-editor-focus", { detail: editor!.children[0] }));
  type CodeMirrorHost = HTMLDivElement & { CodeMirror?: { setValue(value: string): void } };
  await until(
    () => host.querySelector<CodeMirrorHost>(".CodeMirror")?.CodeMirror,
    "源码编辑器未挂载"
  );
  host
    .querySelector<CodeMirrorHost>(".CodeMirror")!
    .CodeMirror!.setValue(source.replace("原始乐谱", "编辑后乐谱"));
  await until(() => svg()?.textContent?.includes("编辑后乐谱"), "源码变化未重新绘制");
  const insertedKit = kit.assembly.getBlockPanelItems(editor!);
  check(
    insertedKit.some(item => item.title === "音乐标注"),
    "乐谱插入入口丢失"
  );
  const html = await htmlSerializerRegistry.serializeAsync(editor!.children);
  check(html.includes("<svg") && html.includes("编辑后乐谱"), "插件静态 SVG 导出失败");
  check(!document.querySelector('[style*="left: -9999px"]'), "导出容器未清理");

  show([
    { type: "abc", content: "X:1\nK:C\n?", children: [{ type: "formatted", text: "" }] },
  ] as unknown as Descendant[]);
  await until(() => host.textContent?.includes("Unknown character"), "语法警告未显示");
  await loadPublishedPlugins([
    {
      runtimeVersion: 1,
      manifest: fixture.artifact.manifest,
      entry: new URL("plugin/main.js", fixture.baseUrl).href,
      nodeTypes: ["abc"],
      styles: new URL("plugin/main.css", fixture.baseUrl).href,
    },
  ]);
  show(value, getBlogKit());
  await until(() => svg()?.querySelector("path"), "博客没有使用同一插件渲染");
  check(svg()?.textContent?.includes("原始乐谱"), "博客标题丢失");
  show(
    [
      { type: "abc", content: "", children: [{ type: "formatted", text: "" }] },
    ] as unknown as Descendant[],
    getBlogKit()
  );
  await until(() => !svg(), "清空后仍有旧乐谱");
  root.unmount();
  check(!host.querySelector("svg"), "卸载后仍有图形");
  return {
    ok: true,
    phase: fixture.phase,
    cases: [
      "desktop-real-svg",
      "render-without-write",
      "edit-source",
      "drag-and-menu",
      "markdown-roundtrip",
      "static-svg-export",
      "warnings",
      "blog-real-package",
      "empty-and-unmount",
    ],
  };
}
Object.assign(window, {
  abcVerification: verify().catch(error => ({
    ok: false,
    error: String(error),
    stack: error.stack,
  })),
});
