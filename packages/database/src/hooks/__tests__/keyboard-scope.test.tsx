import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import useKeyboardNavigation from "../useKeyboardNavigation";

it("键盘操作只影响目标实例，输入与输入法、导航组合键让行", async () => {
  const a = vi.fn();
  const b = vi.fn();
  const edit = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Probe({ id, move }: { id: string; move: typeof a }) {
    const ref = useRef<HTMLDivElement>(null);
    useKeyboardNavigation(move, edit, ref);
    return (
      <div ref={ref} data-id={id}>
        <input />
      </div>
    );
  }
  try {
    await act(async () =>
      root.render(
        <>
          <Probe id="a" move={a} />
          <Probe id="b" move={b} />
        </>
      )
    );
    const target = host.querySelector('[data-id="a"]')!;
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(a).toHaveBeenCalledExactlyOnceWith("down");
    expect(b).not.toHaveBeenCalled();
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true, bubbles: true })
    );
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true })
    );
    target
      .querySelector("input")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(a).toHaveBeenCalledTimes(1);
    expect(edit).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
