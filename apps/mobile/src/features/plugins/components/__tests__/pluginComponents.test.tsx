import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { InstallSheet } from "../InstallSheet";
import { PluginHubTabs, type PluginHubTab } from "../PluginHubTabs";
import { ReleaseHistoryList } from "../ReleaseHistoryList";
import { StoreActionButton } from "../StoreActionButton";
import { StoreEntryRow } from "../StoreEntryRow";
import { CompatibilityNote } from "../CompatibilityNote";
import { PluginManageSheet } from "../PluginManageSheet";
import { hasPendingChange, lifecycleOf } from "../pluginStatus";
import type { ManagedPluginItem } from "../../data/usePluginManager";
import type { CenterCatalogEntry } from "@tau/plugins/center";
import { centerRelease } from "../../../../../../../tests/fixtures/plugins/center";
import { PluginListState } from "../PluginListState";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
async function mount(node: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  document.body.innerHTML = "";
});
const buttons = (scope: ParentNode = document.body) => [...scope.querySelectorAll("button")];
const button = (text: string, scope: ParentNode = document.body) =>
  buttons(scope).find(item => item.textContent?.trim() === text);
const click = async (element: Element | undefined) => {
  expect(element).toBeDefined();
  await act(async () => (element as HTMLElement).click());
};

it("按钮状态机：获取/更新/待生效/已安装/不可用，下载中点按取消，校验中不可点，失败可重试", async () => {
  const handlers = { onPress: vi.fn(), onCancel: vi.fn(), onRetry: vi.fn() };
  const view = await mount(
    <>
      <StoreActionButton
        primary={{ kind: "install", version: "1.0.0", allowed: true }}
        {...handlers}
      />
      <StoreActionButton
        primary={{ kind: "update", version: "1.2.0", allowed: true }}
        {...handlers}
      />
      <StoreActionButton primary={{ kind: "pending", version: "1.2.0" }} {...handlers} />
      <StoreActionButton primary={{ kind: "installed", version: "1.0.0" }} {...handlers} />
      <StoreActionButton primary={{ kind: "unavailable" }} {...handlers} />
    </>
  );
  for (const label of ["获取", "更新", "待生效", "已安装", "不可用"])
    expect(view.textContent).toContain(label);
  await click(button("获取", view));
  expect(handlers.onPress).toHaveBeenCalledTimes(1);
  await act(async () =>
    root?.render(
      <>
        <StoreActionButton
          primary={{ kind: "install", version: "1.0.0", allowed: true }}
          phase="downloading"
          {...handlers}
        />
        <StoreActionButton
          primary={{ kind: "install", version: "1.0.0", allowed: true }}
          phase="checking"
          {...handlers}
        />
        <StoreActionButton
          primary={{ kind: "install", version: "1.0.0", allowed: true }}
          phase="failed"
          {...handlers}
        />
      </>
    )
  );
  await click(view.querySelector('[aria-label="取消下载"]') ?? undefined);
  expect(handlers.onCancel).toHaveBeenCalled();
  expect((view.querySelector('[aria-label="正在校验"]') as HTMLButtonElement).disabled).toBe(true);
  await click(button("重试", view));
  expect(handlers.onRetry).toHaveBeenCalled();
});

it("详情大按钮写明版本；安装未开放时禁用", async () => {
  const view = await mount(
    <>
      <StoreActionButton
        size="lg"
        primary={{ kind: "install", version: "1.4.0", allowed: false, reason: "未开放" }}
        onPress={vi.fn()}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
      />
      <StoreActionButton
        size="lg"
        primary={{ kind: "pending", version: "1.4.0" }}
        onPress={vi.fn()}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
      />
    </>
  );
  expect(buttons(view).find(item => item.textContent === "安装 v1.4.0")?.disabled).toBe(true);
  expect(view.textContent).toContain("v1.4.0 待生效");
});

const entry = (compatible: boolean): CenterCatalogEntry => ({
  pluginId: "example.counter",
  name: "计数器",
  description: "跨端示例",
  categories: ["page"],
  keywords: [],
  publisher: { login: "author", avatarUrl: "" },
  repository: "https://github.com/a/b",
  downloadsTotal: 0,
  downloads7d: 0,
  likes: 0,
  latest: centerRelease("2.0.0", "r2"),
  compatible: compatible ? centerRelease("1.4.0", "r1") : null,
  compatibility: compatible
    ? { status: "compatible", reasons: [] }
    : {
        status: "incompatible",
        reasons: [{ code: "APP_VERSION_TOO_LOW", minAppVersion: "0.5.0" }],
      },
});

it("商店行：整行进详情，按钮单独触发；无兼容版本时以原因替代作者行", async () => {
  const onOpen = vi.fn();
  const onPrimary = vi.fn();
  const view = await mount(
    <ul>
      <StoreEntryRow
        entry={entry(true)}
        primary={{ kind: "install", version: "1.4.0", allowed: true }}
        phase={null}
        divider={false}
        onOpen={onOpen}
        onPrimary={onPrimary}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
      />
    </ul>
  );
  expect(view.textContent).toContain("@author");
  await click(button("获取", view));
  expect(onPrimary).toHaveBeenCalled();
  expect(onOpen).not.toHaveBeenCalled();
  await click(buttons(view).find(item => item.textContent?.includes("计数器")));
  expect(onOpen).toHaveBeenCalled();
  await act(async () =>
    root?.render(
      <ul>
        <StoreEntryRow
          entry={entry(false)}
          primary={{ kind: "unavailable" }}
          phase={null}
          divider
          onOpen={vi.fn()}
          onPrimary={vi.fn()}
          onCancel={vi.fn()}
          onRetry={vi.fn()}
        />
      </ul>
    )
  );
  expect(view.textContent).toContain("需要将 Tau 更新到 0.5.0 或更高版本");
  expect(view.textContent).toContain("不可用");
});

it("兼容结论：完整可用、可安装版本落后于最新、不可安装原因", async () => {
  const view = await mount(
    <CompatibilityNote
      latestVersion="2.0.0"
      compatibleVersion="1.4.0"
      compatibility={{ status: "compatible", reasons: [] }}
    />
  );
  expect(view.textContent).toContain("可在此设备完整使用");
  expect(view.textContent).toContain("此设备可安装 v1.4.0");
  await act(async () =>
    root?.render(
      <CompatibilityNote
        latestVersion="2.0.0"
        compatibleVersion={null}
        compatibility={{
          status: "incompatible",
          reasons: [{ code: "DISTRIBUTION_UNAVAILABLE" }],
        }}
      />
    )
  );
  expect(view.querySelector('[aria-label="不可安装原因"]')?.textContent).toContain(
    "此平台的插件安装尚未开放"
  );
});

const managed = (overrides: Partial<ManagedPluginItem> = {}): ManagedPluginItem => {
  const allowed = { allowed: true, reason: null };
  return {
    id: "example.counter",
    name: "计数器",
    version: "1.0.0",
    enabled: false,
    active: false,
    pending: false,
    editor: false,
    error: null,
    hasBackup: true,
    settings: [],
    actions: {
      enable: allowed,
      disable: allowed,
      uninstall: allowed,
      restore: allowed,
      clearData: allowed,
      cancelPending: allowed,
    },
    ...overrides,
  };
};

it("管理菜单：卸载与清除数据分别确认，不允许的动作说明原因且不执行", async () => {
  const onAction = vi.fn();
  await mount(
    <PluginManageSheet
      open
      item={managed({
        actions: {
          ...managed().actions,
          restore: { allowed: false, reason: "请先停用插件并点「立即生效」后再操作" },
        },
      })}
      onClose={vi.fn()}
      onAction={onAction}
    />
  );
  expect(document.body.textContent).toContain("请先停用插件并点「立即生效」后再操作");
  await click(buttons().find(item => item.textContent?.includes("恢复上一版代码")));
  expect(onAction).not.toHaveBeenCalled();
  await act(async () =>
    root?.render(
      <PluginManageSheet
        key="reopened"
        open
        item={managed()}
        onClose={vi.fn()}
        onAction={onAction}
      />
    )
  );
  await click(buttons().find(item => item.textContent?.startsWith("卸载")));
  expect(document.body.textContent).toContain("正文里的插件内容和插件数据都会保留");
  expect(onAction).not.toHaveBeenCalled();
  await click(button("卸载"));
  expect(onAction).toHaveBeenCalledWith("uninstall");
});

it("状态投影：安装任务优先，撤回优先于失败，启用意图与运行状态不一致算待生效变更", () => {
  expect(lifecycleOf(managed(), "downloading").kind).toBe("downloading");
  expect(
    lifecycleOf(managed({ revoked: { kind: "revoked", reason: "x" }, error: "坏了" })).kind
  ).toBe("revoked");
  expect(lifecycleOf(managed({ pending: true, pendingVersion: "1.1.0" }))).toEqual({
    kind: "pending",
    version: "1.1.0",
  });
  expect(hasPendingChange(managed({ enabled: true, active: false }))).toBe(true);
  expect(hasPendingChange(managed({ enabled: true, active: false, error: "失败" }))).toBe(false);
  expect(hasPendingChange(managed())).toBe(false);
});

it("列表状态覆盖加载、失败重试、空态与加载更多失败", async () => {
  const onRetry = vi.fn();
  const onLoadMore = vi.fn();
  const view = await mount(
    <PluginListState status="error" error="网络不可用" onRetry={onRetry} empty emptyTitle="无">
      {null}
    </PluginListState>
  );
  expect(view.querySelector('[role="alert"]')?.textContent).toContain("网络不可用");
  await click(button("重试", view));
  expect(onRetry).toHaveBeenCalled();
  await act(async () =>
    root?.render(
      <PluginListState status="ready" empty emptyTitle="没有找到插件">
        {null}
      </PluginListState>
    )
  );
  expect(view.textContent).toContain("没有找到插件");
  await act(async () =>
    root?.render(
      <PluginListState
        status="ready"
        empty={false}
        emptyTitle="没有找到插件"
        hasMore
        loadMoreError="超时"
        onLoadMore={onLoadMore}
      >
        <li>计数器</li>
      </PluginListState>
    )
  );
  expect(view.textContent).toContain("计数器");
  expect(view.querySelector('[role="alert"]')?.textContent).toContain("加载更多失败：超时");
  await click(button("加载更多", view));
  expect(onLoadMore).toHaveBeenCalled();
});

it("版本历史标记最新、可安装、已安装与未声明本平台的版本", async () => {
  const view = await mount(
    <ReleaseHistoryList
      platformLabel="iOS"
      items={[
        {
          releaseId: "r3",
          version: "2.0.0",
          publishedAt: "2026-10-20T00:00:00Z",
          minAppVersion: null,
          latest: true,
        },
        {
          releaseId: "r2",
          version: "1.4.0",
          publishedAt: "2026-10-10T00:00:00Z",
          minAppVersion: "0.3.0",
          compatible: true,
          installed: true,
        },
      ]}
    />
  );
  const rows = [...view.querySelectorAll("li")].map(item => item.textContent);
  expect(rows[0]).toContain("最新");
  expect(rows[0]).toContain("未声明iOS");
  expect(rows[1]).toContain("可安装");
  expect(rows[1]).toContain("已安装");
  expect(rows[1]).toContain("iOS最低 0.3.0");
});

it("安装面板确认步骤显示确切版本、大小与权限", async () => {
  const onConfirm = vi.fn();
  await mount(
    <InstallSheet
      open
      mode="update"
      name="计数器"
      state={{ kind: "confirm", version: "1.4.0", size: 300 * 1024, permissions: ["cards:read"] }}
      onConfirm={onConfirm}
      onCancelInstall={vi.fn()}
      onClose={vi.fn()}
    />
  );
  expect(document.body.textContent).toContain("更新 计数器 v1.4.0");
  expect(document.body.textContent).toContain("300 KB");
  expect(document.body.querySelector('[aria-label="插件权限"]')?.textContent).toContain(
    "cards:read"
  );
  await click(button("更新 v1.4.0"));
  expect(onConfirm).toHaveBeenCalled();
});

it("安装面板覆盖不可安装、下载中可取消、待生效与失败重试", async () => {
  const onCancelInstall = vi.fn();
  const onConfirm = vi.fn();
  const props = {
    open: true,
    mode: "install" as const,
    name: "计数器",
    onConfirm,
    onCancelInstall,
    onClose: vi.fn(),
  };
  await mount(
    <InstallSheet
      {...props}
      state={{ kind: "unavailable", reasons: [{ code: "DISTRIBUTION_UNAVAILABLE" }] }}
    />
  );
  expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
    "此平台的插件安装尚未开放"
  );
  await act(async () =>
    root?.render(
      <InstallSheet
        {...props}
        state={{ kind: "installing", phase: "checking", version: "1.0.0" }}
      />
    )
  );
  expect(document.body.textContent).toContain("正在校验包与发布记录");
  expect(document.body.textContent).not.toMatch(/\d+%/);
  await click(button("取消下载"));
  expect(onCancelInstall).toHaveBeenCalled();
  await act(async () =>
    root?.render(<InstallSheet {...props} state={{ kind: "done", version: "1.0.0" }} />)
  );
  expect(document.body.textContent).toContain("已安装 v1.0.0，正在启用");
  await act(async () =>
    root?.render(
      <InstallSheet
        {...props}
        state={{ kind: "failed", version: "1.0.0", message: "摘要不匹配" }}
      />
    )
  );
  expect(document.body.textContent).toContain("已安装的旧版本不受影响");
  await click(button("重试"));
  expect(onConfirm).toHaveBeenCalled();
});

function TabsHarness() {
  const [tab, setTab] = useState<PluginHubTab>("store");
  return <PluginHubTabs idPrefix="hub" value={tab} onChange={setTab} installedCount={2} />;
}

it("商店/已安装切换为 tablist，点击与方向键都能切换", async () => {
  const view = await mount(<TabsHarness />);
  const tabs = [...view.querySelectorAll('[role="tab"]')] as HTMLButtonElement[];
  expect(tabs.map(tab => tab.getAttribute("aria-selected"))).toEqual(["true", "false"]);
  await click(tabs[1]);
  expect(tabs.map(tab => tab.getAttribute("aria-selected"))).toEqual(["false", "true"]);
  await act(async () =>
    tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))
  );
  expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  expect(tabs[1].textContent).toContain("2");
});
