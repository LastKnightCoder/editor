import { act, type ComponentPropsWithoutRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import BadgeDetailModal from "../BadgeDetailModal";
import type { BadgeDefinition, BadgeProgress } from "@/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("motion/react", () => ({
  motion: {
    div: ({
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: ComponentPropsWithoutRef<"div"> & {
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => <div {...props} />,
  },
}));

vi.mock("lucide-react", () => {
  const Icon = (props: ComponentPropsWithoutRef<"svg">) => <svg {...props} />;
  return {
    Calendar: Icon,
    HeartCrack: Icon,
    Info: Icon,
    Repeat: Icon,
    Target: Icon,
    Trophy: Icon,
    X: Icon,
  };
});

vi.mock("@/hooks/useThemeColors", () => ({
  default: () => ({
    activeTextClass: "text-active",
    secondaryTextClass: "text-secondary",
    borderClass: "border-normal",
    tagBgClass: "bg-tag",
    cardBgClass: "bg-card",
    overlayClass: "bg-overlay",
    modalBgClass: "bg-modal",
    textClass: "text-normal",
  }),
}));

const definition: BadgeDefinition = {
  id: 1,
  name: "每日输出连续坚持",
  source: "system",
  status: "active",
  successDesign: {
    title: "每日输出",
    description: "今天有任何输出。",
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
  retroactiveMode: "system",
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

const mount = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <BadgeDetailModal
        open
        definition={definition}
        progress={progress}
        awards={[]}
        onClose={() => undefined}
      />,
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

describe("BadgeDetailModal", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("长期任务的策略信息不显示目标 0", async () => {
    const { root, container } = await mount();

    expect(document.body.textContent).toContain("连续坚持 · 长期任务");
    expect(document.body.textContent).not.toContain("目标 0");

    await unmount(root, container);
  });
});
