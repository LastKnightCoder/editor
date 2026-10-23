import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { InstallSheet } from "../InstallSheet";
import { InstalledPluginCard } from "../InstalledPluginCard";
import { PluginHubTabs, type PluginHubTab } from "../PluginHubTabs";
import { PluginStatusBadge } from "../PluginStatusBadge";
import { ReleaseHistoryList } from "../ReleaseHistoryList";
import { StoreEntryCard } from "../StoreEntryCard";
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

it("状态徽标覆盖全部客户端状态，下载进度以 progressbar 暴露", async () => {
  const view = await mount(
    <>
      <PluginStatusBadge status={{ kind: "downloading", progress: 0.42 }} />
      <PluginStatusBadge status={{ kind: "verifying" }} />
      <PluginStatusBadge status={{ kind: "pending", version: "1.1.0" }} />
      <PluginStatusBadge status={{ kind: "running" }} />
      <PluginStatusBadge status={{ kind: "disabled" }} />
      <PluginStatusBadge status={{ kind: "failed", message: "摘要不匹配" }} />
      <PluginStatusBadge status={{ kind: "revoked", reason: null }} />
    </>
  );
  for (const label of ["下载中 42%", "校验中", "待生效", "运行中", "已停用", "失败", "已撤回"])
    expect(view.textContent).toContain(label);
  expect(view.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("42");
});

it("已安装卡片按允许状态呈现动作，不允许的动作禁用并说明原因", async () => {
  const onAction = vi.fn();
  const view = await mount(
    <InstalledPluginCard
      name="计数器"
      pluginId="example.counter"
      version="1.0.0"
      status={{ kind: "pending", version: "1.1.0" }}
      actions={[
        { kind: "cancelPending", allowed: true },
        { kind: "disable", allowed: true },
        { kind: "restore", allowed: false, reason: "没有备份代码" },
      ]}
      settings={[{ id: "s1", title: "计数器设置" }]}
      onAction={onAction}
      onOpenSetting={vi.fn()}
    />
  );
  expect(view.textContent).toContain("v1.1.0 将在下次打开应用时生效");
  await click(button("取消待生效更新", view));
  expect(onAction).toHaveBeenCalledWith("cancelPending");
  const restore = button("恢复上一版代码", view);
  expect(restore?.disabled).toBe(true);
  const describedBy = restore?.getAttribute("aria-describedby");
  expect(describedBy && document.getElementById(describedBy)?.textContent).toContain(
    "没有备份代码"
  );
  expect(view.querySelector('[aria-label="插件设置"]')?.textContent).toContain("计数器设置");
});

it("卸载与清除数据分别确认：卸载说明保留数据，清除只针对当前工作区", async () => {
  const onAction = vi.fn();
  const view = await mount(
    <InstalledPluginCard
      name="计数器"
      pluginId="example.counter"
      version="1.0.0"
      status={{ kind: "disabled" }}
      actions={[
        { kind: "uninstall", allowed: true },
        { kind: "clearData", allowed: true },
      ]}
      onAction={onAction}
    />
  );
  await click(button("卸载", view));
  expect(document.body.textContent).toContain("正文里的插件内容和插件数据都会保留");
  expect(onAction).not.toHaveBeenCalled();
  await click(button("取消"));
  await click(button("清除此工作区数据", view));
  expect(document.body.textContent).toContain("只清除当前工作区里这个插件的私有数据");
  await click(button("清除"));
  expect(onAction).toHaveBeenCalledTimes(1);
  expect(onAction).toHaveBeenCalledWith("clearData");
});

it("撤回与离线状态如实提示，进行中的动作锁定其余按钮", async () => {
  const view = await mount(
    <InstalledPluginCard
      name="计数器"
      pluginId="example.counter"
      version="1.0.0"
      status={{ kind: "revoked", reason: "安全问题" }}
      statusStale
      busyAction="disable"
      actions={[
        { kind: "disable", allowed: true },
        { kind: "uninstall", allowed: true },
      ]}
      onAction={vi.fn()}
    />
  );
  expect(view.querySelector('[role="alert"]')?.textContent).toContain("中心已撤回此版本：安全问题");
  expect(view.textContent).toContain("发布状态未刷新");
  expect(button("卸载", view)?.disabled).toBe(true);
});

it("商店条目区分最新与可安装版本，安装按钮使用实际可安装版本", async () => {
  const onPrimary = vi.fn();
  const view = await mount(
    <StoreEntryCard
      name="计数器"
      description="跨端示例"
      publisher="author"
      latestVersion="2.0.0"
      compatibleVersion="1.4.0"
      compatibility={{ status: "compatible", reasons: [], missingOptional: ["ui.dialog.v1"] }}
      primary={{ kind: "install", version: "1.4.0", allowed: true }}
      onOpen={vi.fn()}
      onPrimary={onPrimary}
    />
  );
  expect(view.textContent).toContain("最新 v2.0.0");
  expect(view.textContent).toContain("此设备可安装 v1.4.0");
  expect(view.textContent).toContain("部分功能在此设备不可用：ui.dialog.v1");
  await click(button("安装 v1.4.0", view));
  expect(onPrimary).toHaveBeenCalled();
});

it("商店条目无兼容版本时列出原因且不提供安装", async () => {
  const view = await mount(
    <StoreEntryCard
      name="计数器"
      description="跨端示例"
      publisher="author"
      latestVersion="2.0.0"
      compatibleVersion={null}
      compatibility={{
        status: "incompatible",
        missingOptional: [],
        reasons: [
          { code: "APP_VERSION_TOO_LOW", minAppVersion: "0.5.0" },
          { code: "DISTRIBUTION_UNAVAILABLE" },
        ],
      }}
      primary={{ kind: "unavailable" }}
      onOpen={vi.fn()}
      onPrimary={vi.fn()}
    />
  );
  const reasons = view.querySelector('[aria-label="不可安装原因"]');
  expect(reasons?.textContent).toContain("需要将 Tau 更新到 0.5.0 或更高版本");
  expect(reasons?.textContent).toContain("此平台的插件安装尚未开放");
  expect(buttons(view).some(item => item.textContent?.includes("安装 v"))).toBe(false);
  expect(view.textContent).toContain("暂不可安装");
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
  expect(document.body.textContent).toContain("将在下次打开应用时生效");
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
