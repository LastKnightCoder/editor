import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeReadToolbar } from "../WeReadToolbar";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("dayjs", () => ({
  default: () => ({
    format: () => "2026-03-14 01:12",
  }),
}));

const themeColors = {
  hoverClass: "hover:bg-slate-100",
  activeClass: "bg-slate-100",
  textClass: "text-slate-700",
  secondaryTextClass: "text-slate-500",
  activeTextClass: "text-slate-900",
  tagBgClass: "bg-slate-100",
  tagTextClass: "text-slate-700",
  buttonBg: "bg-blue-500",
  buttonTextClass: "text-white",
  cardBgClass: "bg-white",
  cardBorderClass: "border-slate-200",
};

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("WeReadToolbar", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("在 checking 且已有会话时不应显示扫码登录按钮", async () => {
    const { root, container } = await mount(
      <WeReadToolbar
        isConnected={false}
        isChecking={true}
        hasLocalData={true}
        initializing={false}
        hasStoredSession={true}
        userName=""
        lastSyncedAt={1710349920000}
        syncing={false}
        onQuickLogin={() => {}}
        onSync={() => {}}
        themeColors={themeColors}
      />,
    );

    expect(container.textContent).toContain("正在校验微信读书登录状态");
    expect(container.textContent).not.toContain("扫码登录");

    await unmount(root, container);
  });

  it("在未连接且未校验时应显示扫码登录按钮", async () => {
    const { root, container } = await mount(
      <WeReadToolbar
        isConnected={false}
        isChecking={false}
        hasLocalData={true}
        initializing={false}
        hasStoredSession={true}
        userName=""
        lastSyncedAt={null}
        syncing={false}
        onQuickLogin={() => {}}
        onSync={() => {}}
        themeColors={themeColors}
      />,
    );

    expect(container.textContent).toContain("当前未连接，可查看本地缓存");
    expect(container.textContent).toContain("扫码登录");

    await unmount(root, container);
  });
});
