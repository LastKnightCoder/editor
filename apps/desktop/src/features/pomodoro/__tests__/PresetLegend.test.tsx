import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PomodoroPreset, PomodoroSession } from "@/types";
import { PresetLegend } from "../components/Ledger";

const presets = new Map<number, PomodoroPreset>(
  Array.from({ length: 12 }, (_, i) => [
    i + 1,
    {
      id: i + 1,
      name: `预设${i + 1}`,
      mode: "countdown",
      durationMin: 25,
      sortOrder: i,
      archived: false,
      createTime: 0,
      updateTime: 0,
    } satisfies PomodoroPreset,
  ])
);
// 预设 i 累计 (13 - i) × 10 分钟：按时长降序即 1..12
const sessions = [...presets.keys()].map((id): PomodoroSession => ({
  id,
  presetId: id,
  startTime: 0,
  endTime: 1,
  focusMs: (13 - id) * 600_000,
  pauseTotalMs: 0,
  pauseCount: 0,
  pauses: [],
  status: "completed",
  createTime: 0,
  updateTime: 0,
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  // 模拟一行放下 4 个：图例行内第 5 个起换到第二行
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (
    this: HTMLElement
  ) {
    const siblings = this.parentElement ? [...this.parentElement.children] : [];
    return siblings.indexOf(this) >= 4 && this.getAttribute("aria-pressed") !== null ? 30 : 0;
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const render = (highlight: number | null) =>
  act(() =>
    root.render(
      <PresetLegend
        sessions={sessions}
        presetsById={presets}
        highlight={highlight}
        onToggle={() => {}}
        hint="提示"
      />
    )
  );

it("放不下的预设收进「另外 N 个」", () => {
  render(null);
  expect(container.textContent).toContain("另外 8 个");
});

it("高亮项被收起时，按钮显示它的名字", () => {
  render(9);
  expect(container.textContent).not.toContain("另外 8 个");
  const more = [...container.querySelectorAll("button")].pop();
  expect(more?.textContent).toContain("预设9");
});
