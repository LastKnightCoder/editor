import { act, type ComponentPropsWithoutRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProgressGoalCard from "../ProgressGoalCard";
import type { BadgeDefinition, BadgeProgress } from "@/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("motion/react", () => ({
  motion: {
    div: ({
      layout: _layout,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: ComponentPropsWithoutRef<"div"> & {
      layout?: unknown;
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => <div {...props} />,
    circle: ({
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: ComponentPropsWithoutRef<"circle"> & {
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => <circle {...props} />,
  },
}));

vi.mock("@/hooks/useThemeColors", () => ({
  default: () => ({
    activeTextClass: "text-active",
    secondaryTextClass: "text-secondary",
    textClass: "text-normal",
    tagBgClass: "bg-tag",
    cardBorderClass: "border-card",
    cardBgClass: "bg-card",
    hoverBorderClass: "hover-border",
    hoverClass: "hover-bg",
  }),
}));

const definition: BadgeDefinition = {
  id: 1,
  name: "减肥",
  source: "custom",
  status: "active",
  successDesign: {
    title: "卡片写作",
    description: "每天输出卡片",
    icon: "🏃",
    color: "#0891b2",
  },
  failureDesign: null,
  rule: {
    type: "manual_count",
    manualKey: "weight-loss",
    comparator: ">=",
    target: 1,
  },
  schedule: { type: "daily" },
  awardPolicy: { type: "streak", target: 30 },
  milestones: [
    {
      id: 1,
      definitionId: 1,
      milestoneKey: "target-30",
      targetValue: 30,
      title: "卡片写作 30 天",
      description: null,
      icon: "30",
      color: "#0891b2",
      sortOrder: 0,
      createTime: 1,
      updateTime: 1,
    },
  ],
  retroactiveMode: "disabled",
  createTime: 1,
  updateTime: 1,
};

const progress: BadgeProgress = {
  id: 1,
  definitionId: 1,
  currentPeriodKey: "2026-06-27",
  currentValue: 1,
  currentStreak: 1,
  bestStreak: 1,
  accumulatedCount: 1,
  lastPassedPeriodKey: "2026-06-27",
  lastEvaluatedAt: 1,
  updateTime: 1,
};

const mount = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ProgressGoalCard definition={definition} progress={progress} />,
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

describe("ProgressGoalCard", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("使用最新目标名称作为卡片标题，圆环内不渲染旧里程碑标题", async () => {
    const { root, container } = await mount();

    expect(container.querySelector("h3")?.textContent).toBe("减肥");
    expect(container.textContent).not.toContain("卡片写作 30 天");

    await unmount(root, container);
  });
});
