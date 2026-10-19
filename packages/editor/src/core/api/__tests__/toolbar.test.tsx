import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import {
  useToolbarState,
  ToolbarSubmenu,
  IOverlayBackDismiss,
  type OverlayBackDismissProps,
} from "../index";
import { createEditorKit } from "../../kit/EditorKit";
import { EditorKitScope } from "../../kit/context";
import { HoveringBarContext } from "../../components/HoveringToolbar/context";

it("公开工具条状态和子面板保留上下文，返回、隐藏与卸载清理登记", async () => {
  const dismissals = new Set<() => void>();
  function Layer({ onDismiss }: OverlayBackDismissProps) {
    useEffect(() => {
      dismissals.add(onDismiss);
      return () => {
        dismissals.delete(onDismiss);
      };
    }, [onDismiss]);
    return null;
  }
  function Tool() {
    const state = useToolbarState();
    const [open, setOpen] = useState(false);
    return (
      <ToolbarSubmenu
        open={open}
        onOpenChange={setOpen}
        trigger={state.submenuTrigger}
        isHoveringBarShow={state.isHoveringBarShow}
        content={<span data-panel>面板</span>}
      >
        <button data-trigger>{String(state.isCompact)}</button>
      </ToolbarSubmenu>
    );
  }
  const kit = createEditorKit({
    services: [register => register(IOverlayBackDismiss, { Layer })],
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (visible: boolean) =>
    act(async () =>
      root.render(
        <EditorKitScope kit={kit}>
          <HoveringBarContext.Provider
            value={{ isHoveringBarShow: visible, isCompact: true, submenuTrigger: "click" }}
          >
            <Tool />
          </HoveringBarContext.Provider>
        </EditorKitScope>
      )
    );
  try {
    await render(true);
    const trigger = host.querySelector("[data-trigger]") as HTMLButtonElement;
    expect(trigger.textContent).toBe("true");
    await act(async () => trigger.click());
    expect(document.querySelector("[data-panel]")).toBeTruthy();
    expect(dismissals.size).toBe(1);
    await act(async () => [...dismissals][0]());
    expect(document.querySelector("[data-panel]")).toBeNull();
    await act(async () => trigger.click());
    await render(false);
    expect(document.querySelector("[data-panel]")).toBeNull();
    expect(dismissals.size).toBe(0);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
  expect(dismissals.size).toBe(0);
});
