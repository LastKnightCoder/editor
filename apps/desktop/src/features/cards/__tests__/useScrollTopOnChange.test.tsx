/**
 * useScrollTopOnChange：key 变化才滚回顶部；Activity 从隐藏恢复显示会重跑 effect，
 * 不能被当成 key 变化（回归：从详情返回列表丢滚动位置，形变转场时列表随之重排）。
 */

import { act, Activity, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useScrollTopOnChange } from "../components/useScrollTopOnChange";

function Scroller({ scrollKey, onReset }: { scrollKey: string; onReset: () => void }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useScrollTopOnChange(el, scrollKey, onReset);
  return <div ref={setEl} data-testid="scroller" />;
}

it("Activity 恢复显示不滚回顶部，key 变化才滚回并回调", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const onReset = vi.fn();
  const render = (mode: "visible" | "hidden", scrollKey: string) =>
    act(async () =>
      root.render(
        <Activity mode={mode}>
          <Scroller scrollKey={scrollKey} onReset={onReset} />
        </Activity>
      )
    );
  try {
    await render("visible", "a");
    const scroller = host.querySelector<HTMLDivElement>('[data-testid="scroller"]')!;
    scroller.scrollTop = 500;

    await render("hidden", "a");
    await render("visible", "a");
    expect(scroller.scrollTop).toBe(500);
    expect(onReset).not.toHaveBeenCalled();

    await render("visible", "b");
    expect(scroller.scrollTop).toBe(0);
    expect(onReset).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
