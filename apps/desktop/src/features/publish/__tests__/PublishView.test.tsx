import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EPublishProvider } from "@/stores/useSettingStore";
import { PublishView } from "../views/PublishView";

const mocks = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  runner: {} as Record<string, unknown>,
}));

vi.mock("../usePublishConfig", async () => {
  const actual = await vi.importActual<typeof import("../usePublishConfig")>("../usePublishConfig");
  return { ...actual, usePublishConfig: () => mocks.config };
});
vi.mock("../usePublishRun", () => ({ usePublishRun: () => mocks.runner }));
vi.mock("@/components/PublishSelector", () => ({ default: () => <div>选择器</div> }));
vi.mock("@/components/LocalImage", () => ({ default: () => <img alt="" /> }));
vi.mock("@/commands/extra", () => ({ openExternal: vi.fn() }));
vi.mock("@/app/settingsStore", () => ({
  useSettingsStore: { getState: () => ({ openSettings: vi.fn() }) },
}));
vi.mock("@/page/PageProvider", () => ({ useOverlayDismiss: () => {} }));

const makeConfig = (over: Record<string, unknown> = {}) => ({
  active: EPublishProvider.Plugin,
  publish: {
    active: EPublishProvider.Plugin,
    plugin: { id: "tau.publish-github", configurations: {} },
    local: { basePath: "/" },
    site: { templateId: "tau.blog", title: "我的站点", description: "", publicUrl: "" },
  },
  credentialReady: true,
  targetReady: true,
  templateReady: true,
  providerLabel: "GitHub Pages",
  pluginId: "tau.publish-github",
  providerConfig: {},
  providers: [{ id: "tau.publish-github", name: "GitHub Pages" }],
  basePath: "/blog/",
  siteUrl: "https://me.github.io/blog/",
  repoOptions: [],
  branchOptions: [],
  templateOptions: [{ value: "tau.blog", label: "Tau 博客" }],
  connection: "idle",
  connectionMessage: "",
  targetPublicUrl: "",
  templateName: "Tau 博客",
  templateFields: [
    { key: "description", label: "站点描述", type: "textarea" },
    { key: "showStats", label: "显示统计", type: "switch" },
  ],
  templateFieldValues: { description: "记录学习", showStats: true },
  setTemplateField: vi.fn(),
  targetError: "",
  checkConnection: vi.fn(),
  getField: () => "",
  ...over,
});
const makeRunner = (over: Record<string, unknown> = {}) => ({
  selectionCount: 3,
  lastPublishedAt: null,
  onSelectionsChange: vi.fn(),
  plan: { upload: ["index.html", "a.html"], remove: ["old.html"], computedAt: Date.now() },
  planLoading: false,
  planStale: false,
  refreshPlan: vi.fn(),
  run: { kind: "idle" },
  running: false,
  publishNow: vi.fn(),
  resetRun: vi.fn(),
  ...over,
});

let container: HTMLDivElement;
let root: Root;
const render = () => act(() => root.render(<PublishView />));
const text = () => container.textContent ?? "";

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

it("就绪时发布按钮可用并触发发布", () => {
  mocks.config = makeConfig();
  mocks.runner = makeRunner({
    plan: {
      upload: ["index.html", "a.html"],
      remove: ["old.html"],
      computedAt: Date.now(),
      imageWarnings: [
        {
          content: { key: "article:1", type: "article", id: 1 },
          title: "缺图文章",
          url: "/missing.png",
          reason: "本地图片不存在",
        },
      ],
    },
  });
  render();
  const publish = [...container.querySelectorAll("button")].find(b => b.textContent === "发布");
  expect(publish?.disabled).toBe(false);
  act(() => publish!.click());
  expect(mocks.runner.publishNow).toHaveBeenCalled();
});

it("未配置目标时不渲染发布面板", () => {
  mocks.config = makeConfig({ targetReady: false, credentialReady: false });
  mocks.runner = makeRunner({ selectionCount: 0 });
  render();
  expect(text()).not.toContain("本次发布");
});

it("发布中不提供取消按钮", () => {
  mocks.config = makeConfig();
  mocks.runner = makeRunner({
    running: true,
    run: {
      kind: "running",
      startedAt: Date.now(),
      progress: { phase: "uploading", current: 5, total: 10, currentFile: "posts/x.html" },
    },
  });
  render();
  expect(
    [...container.querySelectorAll("button")].some(b => b.textContent?.trim() === "取消")
  ).toBe(false);
});

it("快照推送阶段显示文件数而非计数", () => {
  mocks.config = makeConfig();
  mocks.runner = makeRunner({
    running: true,
    run: {
      kind: "running",
      startedAt: Date.now(),
      progress: { phase: "pushing", current: 0, total: 1881 },
    },
  });
  render();
  expect(text()).not.toContain("0 / 1881");
});

it("站点设置抽屉打开后可切换发布目标并自动检测连接", () => {
  const setProvider = vi.fn();
  const checkConnection = vi.fn();
  mocks.config = makeConfig({ setProvider, checkConnection });
  mocks.runner = makeRunner();
  render();
  const findDrawer = () =>
    [...document.querySelectorAll('aside[role="dialog"]')].find(
      el =>
        document.getElementById(el.getAttribute("aria-labelledby") ?? "")?.textContent ===
        "站点设置"
    );
  expect(findDrawer()).toBeUndefined();
  act(() => [...container.querySelectorAll("button")].find(b => b.textContent === "详情")!.click());
  const drawer = findDrawer()!;
  expect(drawer).toBeDefined();
  expect(drawer.querySelector('[aria-label="发布目标"]')).toBeTruthy();
  expect(checkConnection).toHaveBeenCalledTimes(1);
  expect(drawer.querySelector<HTMLTextAreaElement>('[aria-label="站点描述"]')!.value).toBe(
    "记录学习"
  );
  expect(drawer.querySelector('[aria-label="显示统计"]')!.getAttribute("aria-checked")).toBe(
    "true"
  );
  expect(drawer.textContent).not.toContain("设置 · 集成");
});
