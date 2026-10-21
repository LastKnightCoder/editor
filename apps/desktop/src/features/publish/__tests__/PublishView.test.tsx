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

it("就绪时显示页头身份、计划与发布按钮", () => {
  mocks.config = makeConfig();
  mocks.runner = makeRunner();
  render();
  expect(text()).toContain("我的站点");
  expect(text()).toContain("me.github.io/blog/");
  expect(text()).toContain("GitHub Pages");
  expect(text()).toContain("从未发布");
  expect(text()).toContain("本次发布");
  expect(text()).toContain("上传文件2");
  expect(text()).toContain("删除（已取消勾选）1");
  const publish = [...container.querySelectorAll("button")].find(b => b.textContent === "发布");
  expect(publish?.disabled).toBe(false);
  act(() => publish!.click());
  expect(mocks.runner.publishNow).toHaveBeenCalled();
});

it("未配置目标时右栏换成三步引导", () => {
  mocks.config = makeConfig({ targetReady: false, credentialReady: false });
  mocks.runner = makeRunner({ selectionCount: 0 });
  render();
  expect(text()).toContain("尚未配置发布目标");
  expect(text()).toContain("开始之前");
  expect(text()).toContain("3 步完成首次发布");
  expect(text()).not.toContain("本次发布");
});

it("发布中显示进度且无取消按钮", () => {
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
  expect(text()).toContain("正在发布");
  expect(text()).toContain("posts/x.html");
  expect(text()).toContain("5 / 10");
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
  expect(text()).toContain("推送 1881 个文件");
  expect(text()).not.toContain("0 / 1881");
});

it("部分失败时列出失败文件并提供重新发布", () => {
  mocks.config = makeConfig();
  mocks.runner = makeRunner({
    run: {
      kind: "done",
      finishedAt: Date.now(),
      duration: 3200,
      result: {
        success: false,
        uploaded: ["a.html"],
        deleted: [],
        skipped: [],
        failed: [{ path: "b.html", error: "timeout" }],
      },
    },
  });
  render();
  expect(text()).toContain("1 个上传成功，1 个失败");
  expect(text()).toContain("b.html");
  expect(text()).toContain("重新发布");
});

it("站点设置抽屉打开后可切换发布目标", () => {
  const setProvider = vi.fn();
  mocks.config = makeConfig({ setProvider });
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
  expect(drawer.textContent).toContain("管理发布插件");
  expect(drawer.textContent).not.toContain("设置 · 集成");
});
