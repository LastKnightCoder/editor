import { act, type ComponentPropsWithoutRef } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import BadgePanel from "../BadgePanel";
import type { BadgeDashboard, BadgeDefinition, BadgeProgress } from "@/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { createTabMock, badgeCommandsMock } = vi.hoisted(() => ({
  createTabMock: vi.fn(),
  badgeCommandsMock: {
    dashboard: {
      definitions: [],
      progress: [],
      awards: [],
      todayManualEntries: [],
    } as BadgeDashboard,
    evaluateAllBadges: vi.fn(async () => undefined),
    getBadgeDashboard: vi.fn(async () => undefined as unknown),
  },
}));

badgeCommandsMock.getBadgeDashboard.mockImplementation(
  async () => badgeCommandsMock.dashboard,
);

vi.mock("lucide-react", () => {
  const Icon = (props: ComponentPropsWithoutRef<"svg">) => <svg {...props} />;
  return {
    ArrowRight: Icon,
    Award: Icon,
    Check: Icon,
    Circle: Icon,
    Flame: Icon,
    Target: Icon,
    Trophy: Icon,
  };
});

vi.mock("@/hooks/useThemeColors", () => ({
  default: () => ({
    textClass: "text-normal",
    secondaryTextClass: "text-secondary",
    activeTextClass: "text-active",
    cardBorderClass: "border-card",
    cardBgClass: "bg-card",
    iconBgClass: "bg-icon",
    iconTextClass: "text-icon",
    hoverClass: "hover-bg",
    badgeBgClass: "bg-badge",
    badgeTextClass: "text-badge",
  }),
}));

vi.mock("@/stores/useTabStore", () => ({
  __esModule: true,
  default: () => ({ createTab: createTabMock }),
}));

vi.mock("@/commands/badge", () => badgeCommandsMock);

const definition: BadgeDefinition = {
  id: 1,
  name: "每天输出",
  source: "custom",
  status: "active",
  successDesign: {
    title: "每天输出",
    description: "保持每天输出",
    icon: "✦",
    color: "#2563eb",
  },
  failureDesign: null,
  rule: {
    type: "event_count",
    eventType: "output.created",
    comparator: ">=",
    target: 1,
  },
  schedule: { type: "daily" },
  awardPolicy: { type: "streak", target: 0 },
  milestones: [],
  retroactiveMode: "disabled",
  createTime: 1,
  updateTime: 1,
};

const progress: BadgeProgress = {
  id: 1,
  definitionId: 1,
  currentPeriodKey: "2026-06-28",
  currentValue: 1,
  currentStreak: 3,
  bestStreak: 3,
  accumulatedCount: 3,
  lastPassedPeriodKey: "2026-06-28",
  lastEvaluatedAt: 1,
  updateTime: 1,
};

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { root, container, queryClient };
};

const unmount = async (
  root: Root,
  container: HTMLElement,
  queryClient: QueryClient,
) => {
  await act(async () => {
    root.unmount();
  });
  queryClient.clear();
  container.remove();
};

describe("BadgePanel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    createTabMock.mockReset();
  });

  it("长期任务没有阶段时不显示达标或 /0", async () => {
    badgeCommandsMock.dashboard.definitions = [definition];
    badgeCommandsMock.dashboard.progress = [progress];
    badgeCommandsMock.dashboard.awards = [];
    badgeCommandsMock.dashboard.todayManualEntries = [];

    const { root, container, queryClient } = await mount(<BadgePanel />);

    expect(container.textContent).toContain("每天输出");
    expect(container.textContent).toContain("长期任务");
    expect(container.textContent).not.toContain("达标");
    expect(container.textContent).not.toContain("/0");

    await unmount(root, container, queryClient);
  });
});
