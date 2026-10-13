/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import HandwriteSetter from "../index";
import { getDefaultHandwriteStyle } from "../../../../utils";
import type { HandwriteElement } from "../../../../plugins/HandwritePlugin";

/* ───────── 组件行为 ───────── */

const roots: Root[] = [];

function makeElement(overrides: Partial<HandwriteElement> = {}): HandwriteElement {
  return {
    id: "handwrite-1",
    type: "handwrite",
    name: "手写",
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    points: [
      { x: 0, y: 0, pressure: 0.5 },
      { x: 1, y: 1, pressure: 0.5 },
    ],
    outline: [],
    style: getDefaultHandwriteStyle(),
    ...overrides,
  };
}

/** 受控宿主：onChange 记录新 element 并回写，贴近属性条真实用法 */
function mountSetter(initial: HandwriteElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  let current = initial;
  const received: HandwriteElement[] = [];
  function Harness() {
    return (
      <HandwriteSetter
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

function clickButton(label: string) {
  void act(() => {
    (document.querySelector(`button[aria-label="${label}"]`) as HTMLElement).click();
  });
}

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren();
});

describe("HandwriteSetter 组件", () => {
  it("样式弹层选不透明度「50%」档 → 写入 opacity 0.5", () => {
    const { received } = mountSetter(makeElement());
    clickButton("样式");
    clickButton("50%");
    expect(received).toHaveLength(1);
    expect(received[0].style.opacity).toBe(0.5);
  });

  it("不透明度 Stepper 从 50% 步进 +5 → 写入 opacity 0.55", () => {
    const { received } = mountSetter(
      makeElement({ style: { ...getDefaultHandwriteStyle(), opacity: 0.5 } })
    );
    clickButton("样式");
    clickButton("增大不透明度");
    expect(received).toHaveLength(1);
    expect(received[0].style.opacity).toBe(0.55);
  });

  it("样式弹层选粗细档「粗」（16px）→ 写入 size 16", () => {
    const { received } = mountSetter(
      makeElement({ style: { ...getDefaultHandwriteStyle(), size: 2 } })
    );
    clickButton("样式");
    clickButton("粗");
    expect(received).toHaveLength(1);
    expect(received[0].style.size).toBe(16);
  });
});
