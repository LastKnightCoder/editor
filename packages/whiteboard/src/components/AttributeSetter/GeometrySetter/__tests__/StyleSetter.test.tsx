/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { customColorOption, inferMode, mixWithWhite, StyleSetter } from "../setters/StyleSetter";
import type { GeometryElement } from "../../../../plugins";

describe("inferMode", () => {
  it("fill 透明（transparent / none / 空）→ 线框", () => {
    expect(inferMode({ fill: "transparent", stroke: "#FF6A63" })).toBe("outline");
    expect(inferMode({ fill: "none", stroke: "#FF6A63" })).toBe("outline");
    expect(inferMode({ fill: undefined, stroke: "#FF6A63" })).toBe("outline");
  });

  it("fill 实色且 stroke 透明 → 实心", () => {
    expect(inferMode({ fill: "#FF6A63", stroke: "transparent" })).toBe("solid");
  });

  it("fill 实色 + 描边（含 stroke 缺省）→ 浅底", () => {
    expect(inferMode({ fill: "#B8D9FF", stroke: "#3F71FB" })).toBe("soft");
    expect(inferMode({ fill: "#B8D9FF", stroke: undefined })).toBe("soft");
  });
});

describe("mixWithWhite", () => {
  it("按白色占比混合，输出小写 #rrggbb", () => {
    expect(mixWithWhite("#3F71FB", 0.8)).toBe("#d9e3fe");
    expect(mixWithWhite("#000000", 0)).toBe("#000000");
    expect(mixWithWhite("#FFFFFF", 1)).toBe("#ffffff");
    expect(mixWithWhite("#808080", 0.5)).toBe("#c0c0c0");
  });

  it("非法输入原样返回", () => {
    expect(mixWithWhite("currentColor", 0.8)).toBe("currentColor");
    expect(mixWithWhite("#FFF", 0.8)).toBe("#FFF");
  });
});

describe("customColorOption", () => {
  it("线框：基色作描边、填充透明", () => {
    expect(customColorOption("outline", "#123456")).toEqual({
      fill: "transparent",
      stroke: "#123456",
      color: "currentColor",
    });
  });

  it("实心：基色作填充、描边透明、深色主题文字", () => {
    expect(customColorOption("solid", "#123456")).toEqual({
      fill: "#123456",
      stroke: "transparent",
      color: "#fff",
      theme: "dark",
    });
  });

  it("浅底：基色作描边、填充为 80% 白混色、浅色主题文字", () => {
    expect(customColorOption("soft", "#123456")).toEqual({
      fill: "#d0d6dd",
      stroke: "#123456",
      color: "#000",
      theme: "light",
    });
  });
});

/* ───────── 组件行为 ───────── */

const roots: Root[] = [];

function makeElement(overrides: Partial<GeometryElement> = {}): GeometryElement {
  return {
    id: "el-1",
    type: "geometry",
    geometryType: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    paths: [],
    text: { align: "center", content: [] },
    ...overrides,
  };
}

/** 受控宿主：onChange 记录新 element 并回写，贴近属性条真实用法 */
function mountSetter(initial: GeometryElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  let current = initial;
  const received: GeometryElement[] = [];
  const Component = new StyleSetter().getComponent();
  function Harness() {
    return (
      <Component
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

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren();
});

describe("StyleSetter 组件", () => {
  it("浅底蓝色切「实心」→ 应用实心组同色相（蓝色下标 4）", () => {
    const { received } = mountSetter(
      makeElement({ fill: "#B8D9FF", stroke: "#3F71FB", color: "#000", theme: "light" })
    );
    void act(() => {
      (document.querySelector('button[aria-label="样式"]') as HTMLElement).click();
    });
    const solidRadio = document.querySelector<HTMLInputElement>('input[value="solid"]');
    expect(solidRadio).not.toBeNull();
    void act(() => {
      solidRadio?.click();
    });
    expect(received).toHaveLength(1);
    expect(received[0].fill).toBe("#3F71FB");
    expect(received[0].stroke).toBe("transparent");
    expect(received[0].theme).toBe("dark");
  });

  it("矩形显示圆角档位", () => {
    mountSetter(makeElement({ fill: "#B8D9FF", stroke: "#3F71FB" }));
    void act(() => {
      (document.querySelector('button[aria-label="样式"]') as HTMLElement).click();
    });
    expect(document.querySelector('button[aria-label="小"]')).not.toBeNull();
  });

  it("非矩形不显示圆角档位", () => {
    mountSetter(makeElement({ geometryType: "ellipse", fill: "#B8D9FF", stroke: "#3F71FB" }));
    void act(() => {
      (document.querySelector('button[aria-label="样式"]') as HTMLElement).click();
    });
    expect(document.querySelector('button[aria-label="小"]')).toBeNull();
  });

  it.each([
    ["浅底", { fill: "#FFD0CE", stroke: "#FF6A63" }],
    ["实心", { fill: "#FF6A63", stroke: "transparent" }],
    ["线框", { fill: "transparent", stroke: "#FF6A63" }],
  ])("%s组选红色时只高亮一个色块（红 / 粉不同值）", (_, colors) => {
    mountSetter(makeElement(colors));
    void act(() => {
      (document.querySelector('button[aria-label="样式"]') as HTMLElement).click();
    });
    const pressed = document.querySelectorAll('button.rounded-full[aria-pressed="true"]');
    expect(pressed).toHaveLength(1);
  });
});
