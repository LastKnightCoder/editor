import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HoldToConfirmButton } from "../HoldToConfirmButton";

let host: HTMLDivElement;
let root: Root;

function pointer(type: string) {
  const button = host.querySelector("button")!;
  act(() => {
    button.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  });
}

describe("HoldToConfirmButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
  });

  it("按住满时长才确认，提前松手取消", () => {
    const onConfirm = vi.fn();
    act(() => root.render(<HoldToConfirmButton label="按住覆盖本机" onConfirm={onConfirm} />));

    pointer("pointerdown");
    expect(host.textContent).toContain("继续按住");
    act(() => vi.advanceTimersByTime(800));
    pointer("pointerup");
    act(() => vi.advanceTimersByTime(2000));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(host.textContent).toContain("按住覆盖本机");

    pointer("pointerdown");
    act(() => vi.advanceTimersByTime(1600));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
