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
import { importFromMarkdown, getMarkdown } from "../../src/utils/markdown";
import { htmlSerializerRegistry } from "../../src/utils/html-serializers";
import { collectAssetUrls } from "../../src/utils/content-transfer/assets";

const fixture = (
  window as unknown as {
    galleryFixture: { phase: string; artifact: DevelopmentPluginPackage; enabled: boolean };
  }
).galleryFixture;

// 本地生成的图片，避免网络请求；尺寸已知，布局不必等图片加载
const svg = (color: string) =>
  "data:image/svg+xml;base64," +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="${color}"/></svg>`
  );
const IMAGES = [svg("#e66"), svg("#6a6"), svg("#66e")];
const gallery = {
  type: "image-gallery",
  mode: 1,
  images: IMAGES.map((url, index) => ({
    id: `g${index}`,
    url,
    desc: `第${index + 1}张`,
    width: 400,
    height: 300,
  })),
  children: [{ type: "formatted", text: "" }],
};
const value = [
  gallery,
  { type: "paragraph", children: [{ type: "formatted", text: "图册后的段落" }] },
] as unknown as Descendant[];

// 渲染进程的告警与错误随报告一起写出，失败时便于定位
const logs: string[] = [];
for (const level of ["error", "warn"] as const) {
  const original = console[level];
  console[level] = (...args: unknown[]) => {
    logs.push(`${level}: ${args.map(String).join(" ").slice(0, 300)}`);
    original(...args);
  };
}
const host = document.getElementById("root")!;
const root = createRoot(host);
const check = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
async function until<T>(read: () => T, message: string): Promise<NonNullable<T>> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const result = read();
    if (result) return result as NonNullable<T>;
    if (Date.now() > deadline)
      throw new Error(message + ": " + document.body.textContent?.slice(-500));
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let editor: SlateEditor | undefined;
let serial = 0;
function show(content: Descendant[], kit: ReturnType<typeof createDesktopKit>, readonly: boolean) {
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
const frameBody = () => host.querySelector<HTMLElement>("[data-element-frame] > div");
const mouseDown = (target: Element) =>
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
const keyDown = (key: string) =>
  frameBody()!.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  );
const galleryNode = () =>
  editor!.children.find(node => (node as { type?: string }).type === "image-gallery") as
    (typeof gallery & { mode: number }) | undefined;

async function verify() {
  const definition = evaluatePluginPackage(fixture.artifact, sharedPluginModules);
  desktopContentPlugins.install(fixture.enabled ? [definition] : []);
  const kit = createDesktopKit();
  check(kit.elementTypes.includes("image-gallery") === fixture.enabled, "图册装配状态错误");
  const resources = collectAssetUrls(value);

  if (!fixture.enabled) {
    show(value, kit, false);
    await until(() => editor, "编辑器未初始化");
    check(JSON.stringify(editor!.children) === JSON.stringify(value), "未知节点规范化丢失数据");
    Transforms.insertText(editor!, "更新", { at: { path: [1, 0], offset: 0 } });
    check(JSON.stringify(editor!.children[0]) === JSON.stringify(gallery), "相邻编辑改写未知块");
    check(host.textContent?.includes("此处的内容在当前编辑器中无法显示"), "缺插件未显示占位");
    check(!host.textContent?.includes("image-gallery"), "占位露出节点类型名");
    check(!host.querySelector("[data-element-frame]"), "缺插件仍渲染图册");
    check(resources.length === 0, "缺插件时不应按声明收集图册资源");
    root.unmount();
    return {
      ok: true,
      phase: fixture.phase,
      cases: ["unknown-preserved", "adjacent-edit", "placeholder-no-type"],
    };
  }

  check(
    JSON.stringify(resources.map(item => item.url)) === JSON.stringify(IMAGES),
    "导出打包未按插件声明收集图册图片"
  );
  check(kit.assembly.resources["image-gallery"]?.length, "装配缺少图册资源声明");

  // 编辑：外框、属性条、布局切换、编辑弹窗、删除
  show(value, kit, false);
  await until(() => editor && frameBody(), "图册未渲染进外框");
  await until(() => host.querySelectorAll("[data-element-frame] img").length === 3, "图片未显示");
  mouseDown(frameBody()!);
  const toolbar = await until(
    () => document.querySelector('[role="toolbar"][aria-label="图册属性"]'),
    "点选后未出现属性条"
  );
  toolbar.querySelector<HTMLButtonElement>('[aria-label="瀑布流"]')!.click();
  await until(() => galleryNode()?.mode === 2, "切换布局未写回节点");
  // 等属性条反映新布局（界面已用新节点重新渲染）再按键
  await until(
    () =>
      document.querySelector('[aria-label="图册属性"] [aria-label="瀑布流"][aria-pressed="true"]'),
    "属性条未反映新布局"
  );
  const settingsDialog = () =>
    Array.from(document.querySelectorAll('[role="dialog"]')).find(
      node => !node.closest("[inert]") && node.textContent?.includes("编辑图册")
    );
  keyDown("Enter");
  const dialog = await until(settingsDialog, "Enter 未打开编辑弹窗");
  check(dialog.querySelectorAll("[data-sortable-index]").length === 3, "编辑弹窗图片列表错误");
  // 方向键把第一张移到第二位，确定后写回
  dialog
    .querySelector<HTMLElement>('[data-sortable-index="0"] [aria-roledescription]')!
    .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  await sleep(50);
  Array.from(dialog.querySelectorAll("button"))
    .find(button => button.textContent === "确定")!
    .click();
  await until(() => galleryNode()?.images[0].id === "g1", "排序未写回节点");
  await until(() => !settingsDialog(), "编辑弹窗未关闭");
  mouseDown(frameBody()!);
  await sleep(20);
  keyDown("Delete");
  await until(() => !galleryNode(), "Delete 未删除图册");
  check((editor!.children[0] as { type?: string }).type === "paragraph", "删除后未在原位留下段落");

  // 导出
  const markdown = getMarkdown(value);
  check(
    markdown.split("\n").filter(line => line.startsWith("![](data:")).length === 3,
    "Markdown 导出错误"
  );
  check(importFromMarkdown(markdown).length > 0, "Markdown 导入失败");
  const html = await htmlSerializerRegistry.serializeAsync(value);
  check(html.includes("左右滑动查看更多") && html.includes('alt="第1张"'), "HTML 导出错误");

  // 只读：不显示属性条，单击打开图片查看器
  show(value, kit, true);
  await until(
    () => editor && host.querySelectorAll("[data-element-frame] img").length === 3,
    "只读未显示图片"
  );
  mouseDown(frameBody()!);
  await sleep(50);
  check(!document.querySelector('[role="toolbar"][aria-label="图册属性"]'), "只读出现属性条");
  host.querySelector<HTMLElement>("[data-element-frame] .absolute.cursor-pointer")!.click();
  const viewer = await until(
    () => document.querySelector('[role="dialog"][aria-label="图片预览"]'),
    "单击未打开图片查看器"
  );
  check(viewer.textContent?.includes("第1张"), "图片查看器未显示说明");
  check(JSON.stringify(editor!.children) === JSON.stringify(value), "只读操作改写了文档");
  root.unmount();
  return {
    ok: true,
    phase: fixture.phase,
    cases: [
      "frame-render",
      "toolbar-mode",
      "enter-settings",
      "sortable-keyboard",
      "delete-leaves-paragraph",
      "resources-export-bundle",
      "markdown",
      "html-export",
      "readonly-viewer",
    ],
    logs,
  };
}

Object.assign(window, {
  galleryVerification: verify().catch(error => ({
    ok: false,
    error: String(error),
    stack: error.stack,
    nodes: editor?.children,
    body: document.body.textContent?.slice(0, 300),
    logs,
  })),
});
