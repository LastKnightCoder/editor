import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FadeScroll } from "..";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("scrollRef 为父组件 setState 时，父组件重渲染不会引发无限更新", () => {
  const renders = vi.fn();
  let rerender = () => {};
  function Host() {
    const [el, setEl] = useState<HTMLDivElement | null>(null);
    const [, setTick] = useState(0);
    rerender = () => setTick(n => n + 1);
    renders(el);
    return (
      <FadeScroll scrollRef={setEl}>
        <p>内容</p>
      </FadeScroll>
    );
  }

  act(() => root.render(<Host />));
  // 挂载：首帧 el = null，ref 回调写入节点后再渲染一次
  expect(renders).toHaveBeenCalledTimes(2);
  expect(renders.mock.lastCall?.[0]).toBeInstanceOf(HTMLDivElement);

  renders.mockClear();
  act(() => rerender());
  // 稳定的 ref 回调：父组件再渲染只多一次，不会以 null / 节点反复回调 setState
  expect(renders).toHaveBeenCalledTimes(1);
  expect(renders.mock.lastCall?.[0]).toBeInstanceOf(HTMLDivElement);
});
