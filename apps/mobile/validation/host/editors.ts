import { invoke } from "@tauri-apps/api/core";
import type { MobilePluginRuntime } from "@/app/plugins/runtime";
import type { Navigator } from "@/router/navigatorTypes";
import { createQuickCard, getCardDetail } from "@/services/tauri";
import { clickSourcePage, openSourcePage, writeSource } from "@validation/host/sourcePage";

const stateKey = "tau-editor-validation";
const pause = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
const visible = (element: HTMLElement) =>
  element.getClientRects().length > 0 &&
  !element.closest('[inert],[aria-hidden="true"],[data-page-active="false"]');
const buttons = () =>
  [...document.querySelectorAll<HTMLElement>('button,[role="menuitem"]')].filter(
    element => visible(element) && !(element as HTMLButtonElement).disabled
  );
const button = (label: string) =>
  buttons().find(
    element => element.getAttribute("aria-label") === label || element.textContent?.trim() === label
  ) ?? buttons().find(element => element.textContent?.trim().startsWith(label));
async function until<T>(
  read: () => T | false | null | undefined | Promise<T | false | null | undefined>,
  label: string,
  attempts = 300
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    const value = await read();
    if (value) return value;
    await pause();
  }
  throw new Error(`${label}超时：${document.body.innerText.slice(-1200)}`);
}
const click = async (label: string) => (await until(() => button(label), label)).click();
const input = (element: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
};
const specifications = [
  {
    id: "tau.abc",
    label: "音乐标注",
    source: "X:1\nT:MobileSuite\nM:4/4\nL:1/4\nK:C\nC D E F |",
    marker: "MobileSuite",
    rendered: "[data-tau-abc-preview] svg",
  },
  {
    id: "tau.html",
    label: "HTML / 块级HTML",
    source: '<div id="tau-html-check" class="p-4 bg-accent-soft">MobileHtml</div>',
    marker: "MobileHtml",
    rendered: "#tau-html-check",
  },
  {
    id: "tau.custom-block",
    label: "React 组件",
    source:
      'const Component = () => { const [n,setN] = React.useState(0); return <button id="tau-component-check" className="p-4 bg-accent-soft" onClick={() => setN(n+1)}>MobileComponent:{n}</button>; };',
    marker: "MobileComponent",
    rendered: "#tau-component-check",
  },
  {
    id: "tau.tikz",
    label: "TikZ",
    source: "\\begin{tikzpicture}\n% MobileTikz\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}",
    marker: "MobileTikz",
    rendered: "[data-tau-tikz-preview] svg",
  },
  {
    id: "tau.typst",
    label: "Typst",
    source: "= MobileTypst\n\nHello $x + y = z$",
    marker: "MobileTypst",
    rendered: "[data-tau-typst-preview] svg",
  },
];
type SavedCard = { id: number; plugin: string; marker: string };

/** 显式验证构建专用：操作正常页面和原生数据库，不进入正式构建。 */
export async function validateEditorPlugins(
  runtime: MobilePluginRuntime,
  navigator: Navigator,
  database: string
) {
  const checks: string[] = [];
  const saved: SavedCard[] = JSON.parse(localStorage.getItem(`${stateKey}:cards`) ?? "[]");
  const report = async (status: string, error?: unknown) => {
    const value = {
      status,
      checks,
      saved,
      platform: runtime.environment.getSnapshot().platform,
      error: error === undefined ? undefined : String(error),
      at: new Date().toISOString(),
    };
    await invoke("plugin_kv_write", {
      database,
      pluginId: "validation.editors",
      key: "report",
      value,
      remove: false,
    });
    console.log("[editor-validation]", JSON.stringify(value));
  };
  const open = async (id: number) => {
    const previous = document.querySelector('[data-page-active="true"]');
    navigator.push("contentDetail", { cardId: id });
    await until(() => {
      const current = document.querySelector(
        '[data-page-active="true"][data-page-key="contentDetail"]'
      );
      return current && current !== previous;
    }, "页面切换");
    await until(
      () => [...document.querySelectorAll<HTMLElement>("[data-slate-editor]")].find(visible),
      "正文加载"
    );
    await until(() => {
      const editor = [
        ...document.querySelectorAll<HTMLElement>('[data-slate-editor][contenteditable="true"]'),
      ].find(visible);
      if (editor) return editor;
      return false;
    }, "正文编辑器");
  };
  const insert = async (label: string) => {
    const editor = [
      ...document.querySelectorAll<HTMLElement>('[data-slate-editor][contenteditable="true"]'),
    ].find(visible)!;
    const target = editor.querySelector("[data-slate-string]")!;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    await pause(200);
    await click("插入");
    const search = await until(
      () => document.querySelector<HTMLInputElement>('input[aria-label="搜索块"]'),
      "插入搜索"
    );
    input(search, label);
    await pause(150);
    await click(label);
    await pause(300);
  };
  const remember = (id: number, plugin: string, marker: string) => {
    saved.push({ id, plugin, marker });
    localStorage.setItem(`${stateKey}:cards`, JSON.stringify(saved));
  };
  try {
    if (runtime.errors.size) throw new Error(JSON.stringify([...runtime.errors]));
    if (localStorage.getItem(stateKey) === "passed") return;
    if (localStorage.getItem(stateKey) === "awaitRestart") {
      for (const card of saved) {
        if (!runtime.isPluginActive(card.plugin)) throw new Error(`${card.plugin}重启后未激活`);
        const stored = await getCardDetail(card.id);
        if (
          !JSON.stringify(stored).includes(card.marker) ||
          JSON.stringify(stored).includes("UNSAVED_EDITOR_DRAFT")
        )
          throw new Error(`${card.plugin}重启后数据不一致`);
        await open(card.id);
        const spec = specifications.find(value => value.id === card.plugin);
        if (spec)
          await until(
            () => [...document.querySelectorAll<HTMLElement>(spec.rendered)].find(visible),
            `${card.plugin}重启后渲染`,
            3000
          );
        await navigator.goBack("ui");
        await pause(700);
      }
      checks.push("原生进程重启后全部插件正文与未保存保护一致");
      localStorage.setItem(stateKey, "passed");
      await report("passed");
      return;
    }
    if (localStorage.getItem(stateKey) === "running") return;
    localStorage.setItem(stateKey, "running");
    checks.push("同一批跨端 ZIP 已经原生下载校验、安装并激活");
    for (const spec of specifications) {
      const card = await createQuickCard({
        content: [
          { type: "paragraph", children: [{ type: "formatted", text: `正文 ${spec.id}` }] },
        ],
        count: 0,
      });
      await open(card.id);
      await insert(spec.label);
      // 插入后源码页自动打开；未打开时经点选块与配件栏进入
      await pause(800);
      writeSource(await openSourcePage(), spec.source);
      await pause(100);
      await clickSourcePage("返回");
      const rendered = await until(
        () => document.querySelector<HTMLElement>(spec.rendered),
        `${spec.id}实际渲染`,
        3000
      );
      if (spec.id === "tau.html" || spec.id === "tau.custom-block") {
        await until(() => parseFloat(getComputedStyle(rendered).paddingTop) > 0, "实际运行时样式");
      }
      if (spec.id === "tau.custom-block") {
        rendered.click();
        await until(() => rendered.textContent?.includes("MobileComponent:1"), "自定义组件交互");
      }
      await until(
        async () => JSON.stringify(await getCardDetail(card.id)).includes(spec.marker),
        "SQLite 保存"
      );
      const draft = await openSourcePage();
      writeSource(draft, "UNSAVED_EDITOR_DRAFT");
      await pause(100);
      await clickSourcePage("撤销");
      await until(() => !draft.value.includes("UNSAVED_EDITOR_DRAFT"), "源码页撤销");
      await clickSourcePage("返回");
      await pause(300);
      const stored = JSON.stringify(await getCardDetail(card.id));
      if (
        stored.includes("UNSAVED_EDITOR_DRAFT") ||
        !stored.includes(spec.marker) ||
        !stored.includes(`正文 ${spec.id}`)
      )
        throw new Error(`${spec.id}撤销或外层正文被修改`);
      remember(card.id, spec.id, spec.marker);
      checks.push(`${spec.id}：真实插入、渲染、源码页编辑保存、撤销和正文隔离`);
      await report("running");
      await navigator.goBack("ui");
      await pause(700);
    }
    const gallery = await createQuickCard({
      content: [{ type: "paragraph", children: [{ type: "formatted", text: "正文 gallery" }] }],
      count: 0,
    });
    await open(gallery.id);
    await insert("图册");
    await click("添加图片到图册");
    const imageUrl =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>'
      );
    const addImage = async (marker: string) => {
      (
        await until(
          () =>
            [
              ...document.querySelectorAll<HTMLButtonElement>(
                '[role="dialog"] button[aria-haspopup="menu"]'
              ),
            ].find(visible),
          "图册添加菜单"
        )
      ).click();
      await click("输入链接");
      const url = await until(
        () => document.querySelector<HTMLInputElement>('input[placeholder="输入图片 URL"]'),
        "图册 URL"
      );
      input(url, imageUrl + `#${marker}`);
      await pause(100);
      await click("添加");
    };
    for (let index = 0; index < 2; index++) await addImage(`MobileGallery${index}`);
    await click("后移图片 1");
    await click("确定");
    await until(
      async () => JSON.stringify(await getCardDetail(gallery.id)).includes("MobileGallery0"),
      "图册保存"
    );
    const galleryContent = JSON.stringify(await getCardDetail(gallery.id));
    if (galleryContent.indexOf("MobileGallery1") > galleryContent.indexOf("MobileGallery0"))
      throw new Error("图册排序未保存");
    await click("块操作");
    await click("编辑图册");
    await addImage("UNSAVED_EDITOR_DRAFT");
    await click("取消");
    await pause(500);
    const cancelledGallery = JSON.stringify(await getCardDetail(gallery.id));
    if (
      cancelledGallery.includes("UNSAVED_EDITOR_DRAFT") ||
      !cancelledGallery.includes("正文 gallery")
    )
      throw new Error("图册取消或正文隔离失败");
    remember(gallery.id, "tau.image-gallery", "MobileGallery0");
    checks.push("图册真实插入、链接添加、触摸排序、保存、取消和正文隔离");
    localStorage.setItem(stateKey, "awaitRestart");
    await report("awaitRestart");
  } catch (error) {
    localStorage.setItem(stateKey, "failed");
    await report("failed", error);
  }
}
