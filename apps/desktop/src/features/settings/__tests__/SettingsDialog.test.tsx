import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSettingsStore } from "@/app/settingsStore";
import { SettingsDialog } from "../SettingsDialog";

vi.mock("@/page/PageProvider", () => ({ useOverlayDismiss: () => {} }));
// 子页各自依赖 IPC 命令，外壳测试只关心导航 / 页头 / 搜索
vi.mock("../sections/AppearanceSection", () => ({ AppearanceSection: () => <div>外观子页</div> }));
vi.mock("../sections/SyncSection", () => ({ SyncSection: () => <div>同步子页</div> }));
vi.mock("../sections/ResourceSection", () => ({ ResourceSection: () => <div>资源子页</div> }));
vi.mock("../sections/LLMSection", () => ({ LLMSection: () => <div>模型子页</div> }));
vi.mock("../sections/EmbeddingSection", () => ({ EmbeddingSection: () => <div>嵌入子页</div> }));

let container: HTMLDivElement;
let root: Root;
const render = () => act(() => root.render(<SettingsDialog />));
const navLabels = () =>
  [...container.querySelectorAll('nav[aria-label="设置分区"] .edge-fade-scroll button')].map(
    b => b.textContent
  );
const header = () => container.querySelector("header")?.textContent ?? "";
const search = () => container.querySelector<HTMLInputElement>('input[aria-label="搜索设置"]')!;

const type = (value: string) =>
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(search(), value);
    search().dispatchEvent(new Event("input", { bubbles: true }));
  });

beforeEach(() => {
  useSettingsStore.setState({ open: true, section: "appearance" });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

it("按新信息架构渲染全部分区，页头取分区 label + description", () => {
  render();
  expect(navLabels()).toEqual([
    "外观",
    "同步",
    "资源存储",
    "剪藏与缓存",
    "账号与连接",
    "大语言模型",
    "嵌入模型",
    "图片生成",
    "语音",
    "关于与更新",
  ]);
  expect(header()).toContain("外观");
  expect(header()).toContain("主题、字体与内容图片的默认呈现");
  expect(container.textContent).toContain("外观子页");
});

it("点击导航切换分区，当前项标记 aria-current", () => {
  render();
  const syncBtn = [...container.querySelectorAll("nav button")].find(
    b => b.textContent === "同步"
  )!;
  act(() => (syncBtn as HTMLButtonElement).click());
  expect(useSettingsStore.getState().section).toBe("sync");
  expect(header()).toContain("同步");
  expect(syncBtn.getAttribute("aria-current")).toBe("page");
  expect(container.textContent).toContain("同步子页");
});

it("搜索按分区名 / 关键词过滤，Enter 进入首个命中", () => {
  render();
  type("whisper");
  expect(navLabels()).toEqual(["语音"]);
  act(() => {
    search().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  expect(useSettingsStore.getState().section).toBe("voice");

  type("不存在的设置");
  expect(navLabels()).toEqual([]);
  expect(container.textContent).toContain("没有匹配的设置");
});

it("持久化的旧分区 key 失效时回落到首个分区", () => {
  useSettingsStore.setState({ section: "misc" as never });
  render();
  expect(header()).toContain("外观");
});
