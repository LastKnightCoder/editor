/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { EMarkerType, type ResolvedSketch } from "../../../types";
import SketchArrow from "../SketchArrow";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sketch: ResolvedSketch = { enabled: true, level: "natural", seed: 3 };
let root: Root | null = null;
let container: HTMLDivElement | null = null;

const render = (props: Partial<React.ComponentProps<typeof SketchArrow>> = {}) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <svg>
        <SketchArrow
          d="M 0 0 L 400 0"
          sourceMarker={EMarkerType.None}
          targetMarker={EMarkerType.Arrow}
          lineColor="#333"
          lineWidth={2}
          sketch={sketch}
          {...props}
        />
      </svg>
    );
  });
  return container;
};

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("SketchArrow", () => {
  it("实线：墨迹 + 端点，无遮罩无流动点", () => {
    const el = render();
    expect(el.querySelectorAll("path[fill='#333']").length).toBe(2);
    expect(el.querySelector("mask")).toBeNull();
    expect(el.querySelector("circle")).toBeNull();
  });

  it("虚线：墨迹经遮罩切段；开流动时遮罩 dashoffset 做动画", () => {
    const still = render({ dashed: true });
    const mask = still.querySelector("mask");
    expect(mask).not.toBeNull();
    expect(still.querySelector(`path[mask="url(#${mask!.id})"]`)).not.toBeNull();
    expect(mask!.querySelector("animate")).toBeNull();
    act(() => root?.unmount());

    const flowing = render({ dashed: true, animated: true, animationSpeed: 3 });
    const animate = flowing.querySelector("mask animate");
    expect(animate?.getAttribute("attributeName")).toBe("stroke-dashoffset");
    expect(flowing.querySelector("circle")).toBeNull();
  });

  it("实线开流动：沿中心线跑流动点，数量随长度增长且不超过 4", () => {
    const el = render({ animated: true });
    const dots = el.querySelectorAll("circle");
    expect(dots.length).toBe(2);
    expect(dots[0].querySelector("animateMotion")?.getAttribute("path")).toMatch(/^M/);
  });
});
