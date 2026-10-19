import { createRoot } from "react-dom/client";
import { UiProvider } from "@tau/ui";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Transforms, type Descendant, type Editor as SlateEditor } from "slate";
import { Editor } from "@tau/editor";
import { evaluatePluginPackage, type PublishedPluginRender } from "@tau/plugins/rendering";
import type { DevelopmentPluginPackage } from "@tau/plugins/package";
import { sharedPluginModules } from "../../src/app/plugins/shared-modules";
import { desktopContentPlugins } from "../../shared/content-plugins";
import { createDesktopKit } from "../../src/services/editorKit";
import { loadPublishedPlugins } from "../../../blog/src/services/plugin-runtime";
import { getBlogKit } from "../../../blog/src/services/editorKit";
import { importFromMarkdown, getMarkdown } from "../../src/utils/markdown";
import { htmlSerializerRegistry } from "../../src/utils/html-serializers";
import { IRuntimeStyleCompiler } from "@tau/shared/runtime-style";
import { desktopRuntimeStyleCompiler } from "../../src/services/tailwindRuntime";

const fixture = (
  window as unknown as {
    htmlFixture: {
      phase: string;
      artifact: DevelopmentPluginPackage;
      enabled: boolean;
      baseUrl: string;
      entries: PublishedPluginRender[];
      publishCss: string;
    };
  }
).htmlFixture;
const blockHtml = '<div class="p-4" data-test-block>初始块</div>';
const inlineHtml = '<b class="font-bold" data-test-inline>初始行内</b>';
const value = [
  { type: "html-block", html: blockHtml, children: [{ type: "formatted", text: "" }] },
  {
    type: "paragraph",
    children: [
      { type: "formatted", text: "前" },
      {
        type: "html-inline",
        html: inlineHtml,
        openEdit: true,
        children: [{ type: "formatted", text: "" }],
      },
      { type: "formatted", text: "后" },
    ],
  },
] as unknown as Descendant[];
const host = document.getElementById("root")!;
const root = createRoot(host);
const check = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
async function until(read: () => unknown, message: string) {
  const deadline = Date.now() + 20_000;
  while (!read()) {
    if (Date.now() > deadline)
      throw new Error(message + ": " + document.body.textContent?.slice(-500));
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
const sourceInput = () => {
  const input = document.querySelector<HTMLInputElement>('input[aria-label="行内 HTML 源码"]');
  return input && !input.closest("[inert]") ? input : null;
};
function input(value: string) {
  const target = sourceInput();
  if (!target) throw new Error("缺少行内输入框");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(target, value);
  target.dispatchEvent(new Event("input", { bubbles: true }));
}
function key(key: string) {
  sourceInput()?.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  );
}
let editor: SlateEditor | undefined;
let serial = 0;
function show(content: Descendant[], kit: ReturnType<typeof createDesktopKit>, readonly = true) {
  editor = undefined;
  root.render(
    <UiProvider>
      <DndProvider backend={HTML5Backend}>
        <Editor
          key={++serial}
          kit={kit}
          initValue={content}
          readonly={readonly}
          onInit={current => {
            editor = current;
          }}
        />
      </DndProvider>
    </UiProvider>
  );
}

async function verify() {
  const definition = evaluatePluginPackage(fixture.artifact, sharedPluginModules);
  desktopContentPlugins.install(fixture.enabled ? [definition] : []);
  const kit = createDesktopKit().extend({
    services: [register => register(IRuntimeStyleCompiler, desktopRuntimeStyleCompiler)],
  });
  check(kit.elementTypes.includes("html-block") === fixture.enabled, "HTML 装配状态错误");
  check(kit.elementTypes.includes("html-inline") === fixture.enabled, "行内 HTML 装配状态错误");
  show(value, kit, false);
  await until(() => editor, "编辑器未初始化");
  if (!fixture.enabled) {
    check(JSON.stringify(editor!.children) === JSON.stringify(value), "未知节点规范化丢失数据");
    const before = JSON.stringify(editor!.children[0]);
    Transforms.insertText(editor!, "更新", { at: { path: [1, 0], offset: 0 } });
    check(JSON.stringify(editor!.children[0]) === before, "相邻编辑改写未知块");
    check(
      JSON.stringify(importFromMarkdown(getMarkdown(value))) === JSON.stringify(value),
      "缺包 Markdown 不保真"
    );
    const html = await htmlSerializerRegistry.serializeAsync(value);
    check(html.includes("&lt;div") && html.includes("&lt;b"), "缺包导出未保留转义源码");
    check(!host.querySelector("[data-test-block]"), "缺插件仍渲染 HTML");
    root.unmount();
    return {
      ok: true,
      phase: fixture.phase,
      cases: ["unknown-both-types", "adjacent-edit", "markdown-preserved", "escaped-export"],
    };
  }
  await until(() => host.querySelector("[data-test-block]") && sourceInput(), "编辑预览未显示");
  await until(
    () =>
      Array.from(host.querySelectorAll("style")).some(style =>
        style.textContent?.includes("padding")
      ),
    "块样式未编译"
  );
  input('<i class="font-bold" data-test-inline>修改行内</i>');
  await new Promise(resolve => setTimeout(resolve, 20));
  key("Enter");
  await until(() => JSON.stringify(editor!.children).includes("修改行内"), "行内确认未回写");
  await until(() => !sourceInput(), "行内编辑器未关闭");
  check(JSON.stringify(editor!.children).includes('"openEdit":false'), "openEdit 未清理");

  document.dispatchEvent(new CustomEvent("preview-editor-focus", { detail: editor!.children[0] }));
  type MirrorHost = HTMLDivElement & { CodeMirror?: { setValue(value: string): void } };
  await until(
    () => host.querySelector<MirrorHost>(".CodeMirror")?.CodeMirror,
    "块源码编辑器未打开"
  );
  host
    .querySelector<MirrorHost>(".CodeMirror")!
    .CodeMirror!.setValue(blockHtml.replace("初始块", "修改块"));
  await until(() => JSON.stringify(editor!.children).includes("修改块"), "块编辑未回写 html 字段");
  const css: string[] = [];
  const html = await htmlSerializerRegistry.serializeAsync(editor!.children, {
    tailwindCssCollector: css,
  });
  check(html.includes("修改块") && html.includes("修改行内"), "静态导出丢失 HTML");
  check(
    css.some(part => part.includes("padding")) && css.some(part => part.includes("font-weight")),
    "两类导出样式未收集"
  );
  check(
    kit.assembly.dragSpecs.get("html-block")?.self && !kit.assembly.dragSpecs.has("html-inline"),
    "拖拽声明错误"
  );

  show(value, kit, true);
  await until(() => editor && host.querySelector("[data-test-inline]"), "只读预览未显示");
  await new Promise(resolve => setTimeout(resolve, 250));
  check(!sourceInput(), "只读 openEdit 打开了编辑器");
  const beforeReadonly = JSON.stringify(editor!.children);
  host.querySelector<HTMLElement>("[data-test-inline]")!.click();
  await new Promise(resolve => setTimeout(resolve, 100));
  check(
    !sourceInput() && JSON.stringify(editor!.children) === beforeReadonly,
    "只读点击修改了文档"
  );

  show(value, kit, false);
  await until(sourceInput, "删除场景输入未打开");
  input("  ");
  await new Promise(resolve => setTimeout(resolve, 20));
  key("Escape");
  await until(
    () => !JSON.stringify(editor!.children).includes('"type":"html-inline"'),
    "空行内未删除"
  );

  for (const source of [blockHtml, "前 <b>行内</b> 后"])
    check(getMarkdown(importFromMarkdown(source)).trim() === source, "HTML Markdown 往返失败");
  await loadPublishedPlugins(
    fixture.entries.map(entry => ({
      ...entry,
      entry: new URL("published/" + entry.entry, fixture.baseUrl).href,
      styles: entry.styles ? new URL("published/" + entry.styles, fixture.baseUrl).href : undefined,
    }))
  );
  const publishedStyle = document.createElement("style");
  publishedStyle.textContent = fixture.publishCss;
  document.head.append(publishedStyle);
  show(value, getBlogKit(), true);
  await until(
    () =>
      editor && host.querySelector("[data-test-block]") && host.querySelector("[data-test-inline]"),
    "博客未加载同一 HTML 包"
  );
  check(!sourceInput(), "博客出现行内编辑器");
  check(
    fixture.publishCss.includes("padding") && fixture.publishCss.includes("font-weight"),
    "博客发布缺少两类 CSS"
  );
  check(JSON.stringify(editor!.children) === JSON.stringify(value), "博客预览写回节点");
  root.unmount();
  publishedStyle.remove();
  return {
    ok: true,
    phase: fixture.phase,
    cases: [
      "both-types",
      "inline-enter",
      "block-source",
      "real-tailwind",
      "static-export-css",
      "readonly-openEdit",
      "inline-delete-escape",
      "markdown",
      "blog-same-package",
      "blog-css",
    ],
  };
}
Object.assign(window, {
  htmlVerification: verify().catch(error => ({
    ok: false,
    error: String(error),
    stack: error.stack,
    nodes: editor?.children,
    inputs: Array.from(document.querySelectorAll("input")).map(input => ({
      value: input.value,
      label: input.getAttribute("aria-label"),
    })),
  })),
});
