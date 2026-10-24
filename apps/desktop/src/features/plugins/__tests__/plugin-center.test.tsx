import { act, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createBrowserStorage, type DevelopmentPluginPackage } from "@tau/plugins/host";
import { PluginRuntimeContext } from "@/app/plugins/context";
import { DesktopPluginRuntime, PLUGIN_DETAIL_KEY } from "@/app/plugins/runtime";
import { PageProvider, usePage, type Navigator } from "@/page/PageProvider";
import { PageHost } from "@/page/PageHost";
import type { LocalPluginScan } from "@/types/plugin-local";
import type { PluginCatalog } from "@/types/plugin-center";
import type { PluginCommunity } from "@/types/plugin-center";
import "../pages/plugins.page";
import "../pages/plugin-detail.page";

const mock = vi.hoisted(() => ({
  scan: vi.fn<() => Promise<LocalPluginScan>>(),
  catalog: vi.fn<() => Promise<PluginCatalog>>(),
  release: vi.fn(),
  stage: vi.fn<(id: string) => Promise<{ id: string; version: string }>>(),
  uninstall: vi.fn<(id: string) => Promise<void>>(),
  relaunch: vi.fn(async () => undefined),
  community: vi.fn<() => Promise<PluginCommunity>>(),
  like: vi.fn(),
  comment: vi.fn(),
  deleteComment: vi.fn(),
  preferences: new Map<string, boolean>(),
}));
vi.mock("@/commands/plugin-local", () => ({
  scanLocalPlugins: mock.scan,
  fetchPluginCatalog: mock.catalog,
  fetchPluginRelease: mock.release,
  fetchPluginVersions: vi.fn(async () => []),
  stagePluginRelease: mock.stage,
  uninstallLocalPlugin: mock.uninstall,
  relaunchForPlugins: mock.relaunch,
  stagePluginZip: vi.fn(),
  openPluginDirectory: vi.fn(),
  restoreLocalPlugin: vi.fn(),
  cancelLocalPluginUpdate: vi.fn(),
  setLocalPluginEnabled: async (id: string, enabled: boolean) => {
    mock.preferences.set(id, enabled);
  },
  fetchPluginCommunity: mock.community,
  setPluginLiked: mock.like,
  addPluginComment: mock.comment,
  deletePluginComment: mock.deleteComment,
}));
vi.mock("@/commands/extra", () => ({ openExternal: vi.fn() }));
// 详情资料走只读编辑器；这里只核对过滤后的文档文本，节点过滤规则由 pluginDocument 测试覆盖
vi.mock("@/services/editorKit", () => ({ getPluginDocumentKit: () => ({}) }));
vi.mock("@tau/editor", async () => {
  const { Node } = await import("slate");
  return {
    Editor: ({ initValue }: { initValue: import("slate").Descendant[] }) => (
      <div data-testid="plugin-document">{initValue.map(node => Node.string(node)).join("\n")}</div>
    ),
  };
});

const ID = "test.center";
const center = {
  kind: "center" as const,
  releaseId: "r1",
  pluginId: ID,
  version: "1.0.0",
  sha256: "s",
};
function artifact(): DevelopmentPluginPackage {
  return {
    manifest: {
      formatVersion: 1,
      apiVersion: 1,
      platform: "desktop",
      format: "cjs",
      id: ID,
      name: "中心插件",
      version: "1.0.0",
      main: "main.js",
      integrity: { "main.js": "a".repeat(64) },
    },
    code: `module.exports.default=require('@tau/plugins').definePlugin({id:'${ID}',name:'中心插件',version:'1.0.0',create:()=>({activate(){}})});`,
  };
}
const catalog: PluginCatalog = {
  windowStart: "2026-10-12",
  items: [
    {
      pluginId: ID,
      downloadsTotal: 0,
      downloads7d: 0,
      name: "中心插件",
      description: "从插件中心安装的样本",
      publisher: { login: "author", avatarUrl: "" },
      repository: "https://github.com/author/center",
      latest: {
        releaseId: "r1",
        version: "1.0.0",
        minAppVersion: "0.58.0",
        publishedAt: "2026-10-17T00:00:00.000Z",
        size: 2048,
        sha256: "s".repeat(64),
        downloadUrl: "",
      },
      compatible: null,
    },
  ],
};
catalog.items[0].compatible = catalog.items[0].latest;
let scan: LocalPluginScan;
let root: Root;
let container: HTMLDivElement;
let runtime: DesktopPluginRuntime;
let client: QueryClient;
let navigator: Navigator | undefined;

function Host() {
  const page = usePage();
  useEffect(() => {
    navigator = page.navigator;
  }, [page.navigator]);
  return <PageHost state={page.state} />;
}
const page = () => container.querySelector('[data-page-active=""]') ?? container;
async function settle() {
  await act(async () => {
    await vi.dynamicImportSettled();
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}
async function click(text: string, scope: ParentNode = page()) {
  const button = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    item => item.textContent === text || item.getAttribute("aria-label") === text
  );
  if (!button) throw new Error(`按钮不存在：${text}`);
  await act(async () => button.click());
  await settle();
}
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]') ?? document.body;

beforeEach(async () => {
  localStorage.clear();
  mock.preferences.clear();
  scan = { directory: "/test/plugins", entries: [], updates: [] };
  mock.scan.mockImplementation(async () => ({
    ...scan,
    entries: scan.entries.map(entry => ({
      ...entry,
      enabled: mock.preferences.get(entry.id) ?? false,
    })),
  }));
  mock.catalog.mockResolvedValue(catalog);
  mock.release.mockResolvedValue({
    id: "r1",
    pluginId: ID,
    version: "1.0.0",
    state: "published",
    sha256: "s".repeat(64),
    size: 2048,
    publishedAt: "2026-10-17T00:00:00.000Z",
    repository: "https://github.com/author/center",
    commit: "c".repeat(40),
    publisher: { login: "author", avatarUrl: "" },
    content: {
      manifest: { name: "中心插件", description: "", minAppVersion: "0.58.0" },
      readme: "# 中心插件\n\n使用说明正文 ![截图](https://example.com/a.png)",
      changelog: null,
    },
  });
  mock.stage.mockImplementation(async () => {
    scan = {
      ...scan,
      entries: [{ id: ID, directory: "/x", artifact: artifact(), source: center }],
      updates: [],
    };
    return { id: ID, version: "1.0.0" };
  });
  mock.uninstall.mockImplementation(async () => {
    scan = { ...scan, entries: [] };
  });
  runtime = new DesktopPluginRuntime({
    workspaceId: "A",
    storage: createBrowserStorage(localStorage),
    plugins: [],
    navigator: { push: (...args) => navigator?.push(...args) },
  });
  runtime.attachLocal(localStorage);
  await runtime.local?.refresh();
  client = new QueryClient();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <PageProvider initialKey="plugins">
            <PluginRuntimeContext.Provider value={runtime}>
              <Host />
            </PluginRuntimeContext.Provider>
          </PageProvider>
        </QueryClientProvider>
      </StrictMode>
    )
  );
  await settle();
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
    await runtime.dispose();
  });
  container.remove();
  vi.clearAllMocks();
});

it("发现页安装后立即登记且停用，用户从已安装主动启用", async () => {
  expect(page().textContent).toContain("中心插件");
  expect(page().textContent).toContain("@author");
  await click("安装");
  expect(mock.stage).not.toHaveBeenCalled();
  expect(dialog().textContent).toContain("可以读取和修改你的笔记数据");
  await click("安装", dialog());
  expect(mock.stage).toHaveBeenCalledWith("r1");
  expect(page().textContent).toContain("已安装");
  expect(page().textContent).not.toContain("重启后生效");
  expect(mock.relaunch).not.toHaveBeenCalled();
  expect(runtime.host.getState(ID)).toBe("disabled");
  await click("已安装 1");
  const enable = page().querySelector<HTMLButtonElement>('[aria-label="启用 中心插件"]');
  expect(enable).not.toBeNull();
  await act(async () => enable?.click());
  await settle();
  expect(runtime.host.getState(ID)).toBe("active");
  expect(mock.preferences.get(ID)).toBe(true);
});

it("勾选不再提示后再次安装普通插件直接开始，可从插件页菜单恢复提示", async () => {
  await click("安装");
  const skip = dialog().querySelector<HTMLInputElement>('input[type="checkbox"]');
  await act(async () => skip?.click());
  await click("安装", dialog());
  expect(mock.stage).toHaveBeenCalledTimes(1);
  mock.stage.mockClear();
  scan = { ...scan, entries: [] };
  await act(async () => runtime.local?.refresh());
  await settle();
  await click("安装");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(mock.stage).toHaveBeenCalledWith("r1");

  mock.stage.mockClear();
  scan = { ...scan, entries: [] };
  await act(async () => runtime.local?.refresh());
  await click("更多插件操作");
  const restore = document.querySelector<HTMLElement>('[role="menuitemcheckbox"]');
  expect(restore?.textContent).toContain("安装插件前提示风险");
  expect(restore?.getAttribute("aria-checked")).toBe("false");
  await act(async () => restore?.click());
  await settle();
  await click("安装");
  expect(mock.stage).not.toHaveBeenCalled();
  expect(dialog().textContent).toContain("可以读取和修改你的笔记数据");
});

it("含后台的插件即使勾选过不再提示也每次提示风险", async () => {
  localStorage.setItem("plugins:skip-install-notice", "1");
  const release = await mock.release();
  mock.release.mockResolvedValue({
    ...release,
    systemReviewed: true,
    content: {
      ...release.content,
      manifest: {
        ...release.content.manifest,
        backend: {
          entry: "backend.js",
          reason: "调用本机 OCR 程序",
          scope: "application",
          activation: "on-demand",
          lifetime: "idle",
          systemAccess: ["process"],
        },
      },
    },
  });
  await click("安装");
  expect(mock.stage).not.toHaveBeenCalled();
  expect(dialog().textContent).toContain("本机后台代码");
  expect(dialog().textContent).toContain("调用本机 OCR 程序");
  expect(dialog().querySelector('input[type="checkbox"]')).toBeNull();
  await click("安装", dialog());
  expect(mock.stage).toHaveBeenCalledWith("r1");
});

it("发现页卡片右上角的开关直接启用和停用已安装插件", async () => {
  expect(page().querySelector('[aria-label="启用 中心插件"]')).toBeNull();
  await click("安装");
  await click("安装", dialog());
  const toggle = () =>
    page().querySelector<HTMLButtonElement>('[aria-label$=" 中心插件"][role="switch"]');
  expect(toggle()?.getAttribute("aria-label")).toBe("启用 中心插件");
  await act(async () => toggle()?.click());
  await settle();
  expect(runtime.host.getState(ID)).toBe("active");
  expect(toggle()?.getAttribute("aria-label")).toBe("停用 中心插件");
  await act(async () => toggle()?.click());
  await settle();
  expect(runtime.host.getState(ID)).toBe("disabled");
  expect(mock.preferences.get(ID)).toBe(false);
});

it("详情页读取 README 安全子集，卸载默认保留私有数据", async () => {
  scan = {
    directory: "/test/plugins",
    entries: [{ id: ID, directory: "/x", artifact: artifact(), source: center }],
    updates: [],
  };
  await act(async () => runtime.local?.refresh());
  const data = `tau-plugin-prefs:${JSON.stringify(["A", ID, "count"])}`;
  localStorage.setItem(data, "1");
  await act(async () => navigator?.push(PLUGIN_DETAIL_KEY, { pluginId: ID }));
  await settle();
  expect(page().textContent).toContain("使用说明正文");
  expect(page().textContent).toContain("图片不在应用内加载");
  expect(page().querySelector("img")).toBeNull();
  expect(page().textContent).toContain("author/center");
  expect(page().textContent).toContain("插件中心");
  const more = page().querySelector<HTMLButtonElement>('[aria-label="中心插件 的更多操作"]');
  await act(async () => more?.click());
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    element => element.textContent === "卸载…"
  );
  await act(async () => item?.click());
  await settle();
  await click("卸载", dialog());
  expect(mock.uninstall).toHaveBeenCalledWith(ID);
  expect(localStorage.getItem(data)).toBe("1");
  expect(runtime.host.listPlugins().some(plugin => plugin.id === ID)).toBe(false);
});

it("插件中心离线时发现页给出重试，已安装标签照常可用", async () => {
  mock.catalog.mockRejectedValue(new Error("暂时连不上插件中心，请检查网络后重试"));
  await act(async () => navigator?.push("plugins", { tab: "discover" }));
  await act(async () => {
    root.unmount();
    root = createRoot(container);
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <PageProvider initialKey="plugins">
          <PluginRuntimeContext.Provider value={runtime}>
            <Host />
          </PluginRuntimeContext.Provider>
        </PageProvider>
      </QueryClientProvider>
    );
  });
  await settle();
  expect(page().textContent).toContain("暂时连不上插件中心");
  mock.catalog.mockResolvedValue(catalog);
  await click("重试");
  expect(page().textContent).toContain("从插件中心安装的样本");
});

it("详情按需加载社区，喜欢与删除刷新同一插件，评论失败重试复用请求ID", async () => {
  let data: PluginCommunity = { likes: 0, liked: false, comments: [], nextCursor: null };
  mock.community.mockImplementation(async () => structuredClone(data));
  mock.like.mockImplementation(async (_id: string, liked: boolean) => {
    data = { ...data, liked, likes: liked ? 1 : 0 };
    return { liked };
  });
  mock.comment
    .mockRejectedValueOnce(new Error("请求结果未知"))
    .mockImplementation(async (_id: string, message: string) => {
      const row = { id: "c1", message, canDelete: true, deleted: false, createdAt: "2026-10-18" };
      data = { ...data, comments: [row] };
      return row;
    });
  mock.deleteComment.mockImplementation(async () => {
    data = { ...data, comments: [] };
    return { deleted: true };
  });
  await act(async () => navigator?.push(PLUGIN_DETAIL_KEY, { pluginId: ID }));
  await settle();
  expect(mock.community).not.toHaveBeenCalled();
  await click("评论与喜欢");
  expect(mock.community).toHaveBeenCalledWith(ID, null);
  await click("喜欢 · 0");
  expect(mock.like).toHaveBeenCalledWith(ID, true);
  await click("取消喜欢 · 1");
  expect(mock.like).toHaveBeenLastCalledWith(ID, false);
  const textarea = page().querySelector<HTMLTextAreaElement>('textarea[aria-label="评论内容"]');
  if (!textarea) throw new Error("未找到评论输入框");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
      textarea,
      "<b>使用体验</b>"
    );
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("发表评论");
  expect(page().textContent).toContain("请求结果未知");
  expect(textarea.value).toBe("<b>使用体验</b>");
  await click("发表评论");
  expect(mock.comment.mock.calls[0][2]).toBe(mock.comment.mock.calls[1][2]);
  expect(page().textContent).toContain("<b>使用体验</b>");
  expect(textarea.value).toBe("");
  await click("删除我的评论");
  expect(mock.deleteComment).not.toHaveBeenCalled();
  await click("确认删除", dialog());
  expect(mock.deleteComment).toHaveBeenCalledWith(ID, "c1");
  expect(page().textContent).toContain("暂无评论。");
});

it("发现页按分类单选筛选，关键词参与搜索，卡片显示分类", async () => {
  const other = {
    ...catalog.items[0],
    pluginId: "test.sync",
    name: "同步插件",
    description: "备份到对象存储",
    categories: ["sync" as const],
    keywords: ["MinIO"],
  };
  mock.catalog.mockResolvedValue({
    ...catalog,
    items: [{ ...catalog.items[0], categories: ["editor", "ai"] }, other],
  });
  await act(async () => client.invalidateQueries({ queryKey: ["plugins", "catalog"] }));
  await settle();
  expect(
    [...(page().querySelector('[aria-label="分类"]')?.querySelectorAll("li") ?? [])].map(
      item => item.textContent
    )
  ).toEqual(["编辑器", "AI"]);
  const trigger = page().querySelector<HTMLButtonElement>('[aria-label="插件分类：全部分类"]');
  expect(trigger).not.toBeNull();
  await act(async () => trigger?.click());
  await settle();
  const options = [...document.querySelectorAll('[role="menuitemradio"]')];
  expect(options.map(item => item.textContent)).toEqual(["全部分类", "同步1", "编辑器1", "AI1"]);
  await act(async () => (options[1] as HTMLElement).click());
  await settle();
  expect(page().textContent).toContain("同步插件");
  expect(page().textContent).not.toContain("中心插件");
  const search = page().querySelector<HTMLInputElement>('input[placeholder="搜索插件"]');
  if (!search) throw new Error("搜索框不存在");
  await act(async () => {
    // 走原生 setter，React 受控输入才会收到 input 事件
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      search,
      "minio"
    );
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
  // 回到全部分类后，关键词仍只命中同步插件
  await act(async () =>
    page().querySelector<HTMLButtonElement>('[aria-label="插件分类：同步"]')?.click()
  );
  await settle();
  await act(async () =>
    (document.querySelector('[role="menuitemradio"]') as HTMLElement | null)?.click()
  );
  await settle();
  expect(page().querySelector('[aria-label="插件分类：全部分类"]')).not.toBeNull();
  expect(page().textContent).toContain("同步插件");
  expect(page().textContent).not.toContain("中心插件");
});

const withSkill = (pack: ReturnType<typeof artifact>) => ({
  ...pack,
  manifest: {
    ...pack.manifest,
    skills: ["guide"],
    integrity: { ...pack.manifest.integrity, "skills/guide/SKILL.md": "b".repeat(64) },
  },
});

it("详情页按实际注册列出此插件提供的功能，并显示作者填写的分类", async () => {
  const code = `module.exports.default=require('@tau/plugins').definePlugin({id:'${ID}',name:'中心插件',version:'1.0.0',create:()=>({activate(ctx){ctx.commands.register({id:'a',title:'甲',run:()=>null});ctx.commands.register({id:'b',title:'乙',run:()=>null});}})});`;
  mock.catalog.mockResolvedValue({
    ...catalog,
    items: [{ ...catalog.items[0], categories: ["ai"] }],
  });
  await act(async () => client.invalidateQueries({ queryKey: ["plugins", "catalog"] }));
  scan = {
    directory: "/test/plugins",
    entries: [
      { id: ID, directory: "/x", artifact: withSkill({ ...artifact(), code }), source: center },
    ],
    updates: [],
  };
  mock.preferences.set(ID, true);
  await act(async () => runtime.local?.refresh());
  await settle();
  expect(runtime.host.getState(ID)).toBe("active");
  await act(async () => navigator?.push(PLUGIN_DETAIL_KEY, { pluginId: ID }));
  await settle();
  const aside = page().querySelector("aside");
  if (!aside) throw new Error("详情侧栏不存在");
  expect(aside.textContent).toContain("分类AI");
  const items = [...aside.querySelectorAll("li")].map(item => item.textContent);
  expect(items).toEqual(["命令2", "Skill1"]);
});

it("更新页「全部更新」并行下载全部可更新插件，单项按钮同步显示进度", async () => {
  const second = "test.second";
  const secondArtifact = (): DevelopmentPluginPackage => {
    const value = artifact();
    return {
      manifest: { ...value.manifest, id: second, name: "第二插件" },
      code: value.code.replaceAll(ID, second).replaceAll("中心插件", "第二插件"),
    };
  };
  scan = {
    ...scan,
    entries: [
      { id: ID, directory: "/a", artifact: artifact(), source: center },
      {
        id: second,
        directory: "/b",
        artifact: secondArtifact(),
        source: { ...center, pluginId: second },
      },
    ],
  };
  await act(async () => runtime.local?.refresh());
  const next = (pluginId: string, name: string, releaseId: string) => {
    const latest = { ...catalog.items[0].latest, releaseId, version: "1.1.0" };
    return { ...catalog.items[0], pluginId, name, latest, compatible: latest };
  };
  mock.catalog.mockResolvedValue({
    ...catalog,
    items: [next(ID, "中心插件", "r-a2"), next(second, "第二插件", "r-b2")],
  });
  const finishes: (() => void)[] = [];
  mock.stage.mockImplementation(
    id => new Promise(resolve => finishes.push(() => resolve({ id, version: "1.1.0" })))
  );
  await act(async () => navigator?.push("plugins", { tab: "updates" }));
  await settle();
  await click("全部更新 2");
  expect(mock.stage.mock.calls.map(([id]) => id)).toEqual(["r-a2", "r-b2"]);
  expect(page().textContent).toContain("下载校验中");
  expect(page().textContent).not.toContain("全部更新");
  await act(async () => {
    for (const finish of finishes) finish();
  });
  await settle();
  expect(mock.stage).toHaveBeenCalledTimes(2);
});
