// 预览渲染器的 onError 协议：出错回调错误与「是否还留着旧结果」，并保留上一次成功的结果
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import PlantUML from "../renderers/PlantUML";

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
describe("PlantUML onError", () => {
  it("新图加载失败时退回上一张成功的图并上报", async () => {
    const onError = vi.fn();
    const host = await render(<PlantUML isDark={false} content="A -> B" onError={onError} />);
    const img = () => host.querySelector("img") as HTMLImageElement;
    const firstSrc = img().getAttribute("src");
    await act(async () => {
      img().dispatchEvent(new Event("load"));
    });
    expect(onError).toHaveBeenLastCalledWith(null);

    await render(<PlantUML isDark={false} content="A -> C" onError={onError} />);
    expect(img().getAttribute("src")).not.toBe(firstSrc);
    await act(async () => {
      img().dispatchEvent(new Event("error"));
    });
    expect(onError).toHaveBeenLastCalledWith(expect.stringContaining("PlantUML"), true);
    expect(img().getAttribute("src")).toBe(firstSrc);
  });
});
