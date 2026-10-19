import { act, Activity, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { createEditorKit } from "../kit/EditorKit";
import { EditorKitScope } from "../kit/context";
import { IOverlayBackDismiss, OverlayBackDismiss, type OverlayBackDismissProps } from "../api";

it("适配遵循子级服务覆盖，Activity 隐藏和卸载注销，缺服务不挂载", async () => {
  const parentMount = vi.fn();
  const childMount = vi.fn();
  const cleanup = vi.fn();
  const Parent = () => {
    useEffect(parentMount, []);
    return null;
  };
  const Child = ({ onDismiss }: OverlayBackDismissProps) => {
    useEffect(() => {
      childMount(onDismiss);
      return cleanup;
    }, [onDismiss]);
    return null;
  };
  const parent = createEditorKit({
    services: [register => register(IOverlayBackDismiss, { Layer: Parent })],
  });
  const child = parent.extend({
    services: [register => register(IOverlayBackDismiss, { Layer: Child })],
  });
  const empty = createEditorKit();
  const dismiss = vi.fn();
  const host = document.createElement("div");
  const root = createRoot(host);
  const render = (hidden: boolean, open = true, missing = false) =>
    root.render(
      <EditorKitScope kit={parent}>
        <Activity mode={hidden ? "hidden" : "visible"}>
          <EditorKitScope kit={missing ? empty : child}>
            <OverlayBackDismiss open={open} onDismiss={dismiss} />
          </EditorKitScope>
        </Activity>
      </EditorKitScope>
    );
  try {
    await act(async () => render(false));
    expect(parentMount).not.toHaveBeenCalled();
    expect(childMount).toHaveBeenCalledTimes(1);
    expect(childMount).toHaveBeenCalledWith(dismiss);
    await act(async () => render(true));
    expect(cleanup).toHaveBeenCalledTimes(1);
    await act(async () => render(false));
    expect(childMount).toHaveBeenCalledTimes(2);
    await act(async () => render(false, false));
    expect(cleanup).toHaveBeenCalledTimes(2);
    await act(async () => render(false, true, true));
    expect(childMount).toHaveBeenCalledTimes(2);
    await act(async () => render(false));
    expect(childMount).toHaveBeenCalledTimes(3);
  } finally {
    await act(async () => root.unmount());
  }
  expect(cleanup).toHaveBeenCalledTimes(3);
});
