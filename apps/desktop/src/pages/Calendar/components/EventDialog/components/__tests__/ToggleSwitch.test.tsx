import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import ToggleSwitch from "../ToggleSwitch";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mount = async (node: ReactNode) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { root, container };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("ToggleSwitch", () => {
  it("点击开关本体时应切换", async () => {
    const onChange = vi.fn();
    const { root, container } = await mount(
      <ToggleSwitch checked={false} onChange={onChange} label="全天" />,
    );

    const switchTrack = container.querySelector("label");
    expect(switchTrack).toBeTruthy();

    await act(async () => {
      switchTrack?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(true);

    await unmount(root, container);
  });

  it("点击文案时不应切换", async () => {
    const onChange = vi.fn();
    const { root, container } = await mount(
      <ToggleSwitch checked={false} onChange={onChange} label="全天" />,
    );

    const labelText = Array.from(container.querySelectorAll("span")).find(
      (element) => element.textContent?.trim() === "全天",
    );
    expect(labelText).toBeTruthy();

    await act(async () => {
      labelText?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChange).not.toHaveBeenCalled();

    await unmount(root, container);
  });
});
