import { App } from "antd";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PomodoroWindowPage from "../index";
import type { PomodoroPreset } from "@/types";

const { pomodoroStoreState } = vi.hoisted(() => ({
  pomodoroStoreState: {
    activeSession: null,
    initPomodoro: vi.fn(async () => undefined),
    initStatus: "idle" as "idle" | "loading" | "ready" | "error",
    inited: false,
    elapsedMs: 0,
    remainMs: undefined as number | undefined,
    rightSidebarWidth: 350,
    presets: [] as PomodoroPreset[],
    refreshPresets: vi.fn(async () => undefined),
    refreshSummary: vi.fn(async () => undefined),
    today: { count: 0, focusMs: 0 },
    total: { count: 0, focusMs: 0 },
  },
}));

vi.mock("@/commands", () => ({
  createPomodoroPreset: vi.fn(),
  updatePomodoroPreset: vi.fn(),
  archivePomodoroPreset: vi.fn(),
  reorderPomodoroPresets: vi.fn(),
  startPomodoroSession: vi.fn(),
  pausePomodoroSession: vi.fn(),
  resumePomodoroSession: vi.fn(),
  stopPomodoroSession: vi.fn(),
}));

vi.mock("@/commands/pomodoro", () => ({
  deletePomodoroPreset: vi.fn(),
}));

vi.mock("@/commands/window", () => ({
  openPomodoroMiniWindow: vi.fn(),
  openPomodoroImmersiveWindow: vi.fn(),
}));

vi.mock("@/hooks/useDatabaseChangeEffect", () => ({
  useDatabaseChangeEffect: () => undefined,
}));

vi.mock("@/stores/usePomodoroStore", () => {
  const usePomodoroStore = () => pomodoroStoreState;
  usePomodoroStore.setState = vi.fn();
  usePomodoroStore.getState = () => pomodoroStoreState;
  return { usePomodoroStore };
});

vi.mock("@/hooks/useThemeColors", () => ({
  default: () => ({
    textClass: "text-gray-800",
    hoverClass: "hover:bg-gray-100",
    buttonBg: "bg-blue-500",
    buttonTextClass: "text-white",
    activeTextClass: "text-[var(--th-accent)]",
    accentSoftBg: "rgba(59, 130, 246, 0.2)",
    accentColor: "rgb(59, 130, 246)",
  }),
}));

vi.mock("@/stores/useSettingStore", () => ({
  default: (selector?: (state: { setting: { darkMode: boolean } }) => unknown) =>
    selector ? selector({ setting: { darkMode: false } }) : undefined,
}));

vi.mock("@/components/DndProvider", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../components/PresetItem", () => ({
  default: ({ preset }: { preset: PomodoroPreset }) => (
    <li data-testid="preset-item">{preset.name}</li>
  ),
}));

vi.mock("../components/PresetModal", () => ({
  default: () => null,
}));

vi.mock("../components/Timeline", () => ({
  default: () => <div data-testid="timeline" />,
}));

vi.mock("../components/BackgroundSoundPanel", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ResizableAndHideableSidebar", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

const mount = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <App>
        <PomodoroWindowPage />
      </App>
    );
  });
  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("PomodoroWindowPage", () => {
  beforeEach(() => {
    pomodoroStoreState.activeSession = null;
    pomodoroStoreState.initStatus = "idle";
    pomodoroStoreState.inited = false;
    pomodoroStoreState.presets = [];
    pomodoroStoreState.today = { count: 0, focusMs: 0 };
    pomodoroStoreState.total = { count: 0, focusMs: 0 };
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("初始化加载中不应显示空状态", async () => {
    pomodoroStoreState.initStatus = "loading";

    const { root, container } = await mount();

    expect(container.textContent).not.toContain("暂无番茄钟");

    await unmount(root, container);
  });

  it("初始化完成且没有预设时显示空状态", async () => {
    pomodoroStoreState.initStatus = "ready";
    pomodoroStoreState.inited = true;

    const { root, container } = await mount();

    expect(container.textContent).toContain("暂无番茄钟");
    expect(container.textContent).toContain("新建番茄钟");

    await unmount(root, container);
  });
});
