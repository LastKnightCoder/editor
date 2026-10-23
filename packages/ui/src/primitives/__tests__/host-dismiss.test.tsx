import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Dialog } from "../Dialog";
import { Drawer } from "../Drawer";
import { UiHostProvider } from "../../UiHostProvider";
import { PortalScope, UiProvider } from "../../UiProvider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("真实 Dialog/Drawer 登记系统返回，锁定态吞返回；卸载清理局部 Portal", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const dismissers = new Set<() => void>();
  const register = (dismiss: () => void) => {
    dismissers.add(dismiss);
    return () => {
      dismissers.delete(dismiss);
    };
  };
  const onChange = vi.fn();
  const render = (locked: boolean) =>
    act(async () =>
      root.render(
        <PortalScope>
          <UiProvider>
            <UiHostProvider registerDismiss={register}>
              <Dialog open locked={locked} title="测试" onOpenChange={onChange}>
                正文
              </Dialog>
              <Drawer open title="抽屉" onOpenChange={onChange}>
                详情
              </Drawer>
            </UiHostProvider>
          </UiProvider>
        </PortalScope>
      )
    );
  try {
    await render(true);
    expect(dismissers.size).toBe(2);
    await act(async () => [...dismissers][0]());
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => [...dismissers][1]());
    expect(onChange).toHaveBeenCalledWith(false);
    onChange.mockClear();
    await render(false);
    await act(async () => [...dismissers][0]());
    expect(onChange).toHaveBeenCalledWith(false);
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
  expect(dismissers.size).toBe(0);
  expect(document.querySelector(".tau-ui-portals")).toBeNull();
});

it("同批打开的嵌套模态先关闭子层，不受 React effect 挂载顺序影响", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const stack = new Set<() => void>();
  const register = (dismiss: () => void) => {
    stack.add(dismiss);
    return () => {
      stack.delete(dismiss);
    };
  };
  const outer = vi.fn();
  const inner = vi.fn();
  const render = (open: boolean) =>
    act(async () =>
      root.render(
        <UiHostProvider registerDismiss={register}>
          <Dialog open title="外层" onOpenChange={outer}>
            <Dialog open={open} title="内层" onOpenChange={inner}>
              内层正文
            </Dialog>
          </Dialog>
        </UiHostProvider>
      )
    );
  try {
    await render(true);
    expect(stack.size).toBe(1);
    await act(async () => [...stack][0]());
    expect(inner).toHaveBeenCalledWith(false);
    expect(outer).not.toHaveBeenCalled();
    await render(false);
    await act(async () => [...stack][0]());
    expect(outer).toHaveBeenCalledWith(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
  expect(stack.size).toBe(0);
});
