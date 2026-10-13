/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

// 笔触弹层依赖 BoardProvider（useBoard），与本组件行为断言无关
vi.mock("../../SketchPopover", () => ({
  default: () => null,
}));

import ArrowSetter from "../index";
import { EArrowLineType, EMarkerType, type ArrowElement } from "../../../../types";

/* ───────── 组件行为 ───────── */

const roots: Root[] = [];

function makeElement(overrides: Partial<ArrowElement> = {}): ArrowElement {
  return {
    id: "arrow-1",
    type: "arrow",
    lineType: EArrowLineType.STRAIGHT,
    source: { marker: EMarkerType.Arrow },
    target: { marker: EMarkerType.Arrow },
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ],
    lineWidth: 2,
    ...overrides,
  };
}

/** 受控宿主：onChange 记录新 element 并回写，贴近属性条真实用法 */
function mountSetter(initial: ArrowElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  let current = initial;
  const received: ArrowElement[] = [];
  function Harness() {
    return (
      <ArrowSetter
        element={current}
        onChange={next => {
          received.push(next);
          current = next;
        }}
      />
    );
  }
  void act(() => {
    root.render(<Harness />);
  });
  return { received };
}

function openPopover(label: string) {
  void act(() => {
    (document.querySelector(`button[aria-label="${label}"]`) as HTMLElement).click();
  });
}

function clickOption(label: string) {
  void act(() => {
    (document.querySelector(`button[aria-label="${label}"]`) as HTMLElement).click();
  });
}

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren();
});

describe("ArrowSetter 组件", () => {
  it("端点弹层合并起点 / 终点两组档位", () => {
    mountSetter(makeElement());
    openPopover("端点");
    expect(document.querySelectorAll('button[aria-label="标准箭头"]')).toHaveLength(2);
  });

  it("样式弹层选虚线档 → dashed=true 且写入对应 dashArray", () => {
    const { received } = mountSetter(makeElement());
    openPopover("样式");
    clickOption("点线");
    expect(received).toHaveLength(1);
    expect(received[0].dashed).toBe(true);
    expect(received[0].dashArray).toEqual([2, 2]);
  });

  it("样式弹层选实线 → dashed=false", () => {
    const { received } = mountSetter(makeElement({ dashed: true, dashArray: [2, 2] }));
    openPopover("样式");
    clickOption("实线");
    expect(received).toHaveLength(1);
    expect(received[0].dashed).toBe(false);
  });

  it("默认速度 3 高亮「中」，选「快」写入 animationSpeed=6", () => {
    const { received } = mountSetter(makeElement({ animated: true, animationSpeed: 3 }));
    openPopover("流动动画");
    expect(document.querySelector('button[aria-label="中"][aria-pressed="true"]')).not.toBeNull();
    clickOption("快");
    expect(received).toHaveLength(1);
    expect(received[0].animationSpeed).toBe(6);
  });
});
