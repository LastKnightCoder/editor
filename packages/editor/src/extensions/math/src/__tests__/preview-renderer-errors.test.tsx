import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import Katex from "../renderers/Katex";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement | null = null;

const render = async (node: React.ReactNode) => {
  if (!container) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => {
    root!.render(node);
  });
  return container;
};

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("Katex onError", () => {
  it("出错时保留上一次的公式并回调 hasPrevious", async () => {
    const onError = vi.fn();
    const host = await render(<Katex tex="x^2" onError={onError} />);
    const before = host.innerHTML;
    expect(onError).toHaveBeenLastCalledWith(null);

    await render(<Katex tex="\frac{1}{" onError={onError} />);
    expect(onError).toHaveBeenLastCalledWith(expect.stringContaining("KaTeX parse error"), true);
    expect(host.innerHTML).toBe(before);
  });

  it("不传 onError 时沿用容错渲染，错误片段原地显示", async () => {
    const host = await render(<Katex tex="\frac{1}{" />);
    expect(host.querySelector(".katex-error")).toBeTruthy();
  });
});
