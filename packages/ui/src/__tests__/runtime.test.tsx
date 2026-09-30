import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PortalScope, UiProvider } from "../UiProvider";
import { Popover } from "../primitives/Popover";
import { Select } from "../primitives/Select";
import { lockBodyScroll } from "../hooks/lockBodyScroll";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach(dispose => dispose());
  document.body.innerHTML = "";
});
describe("公共 UI 运行时", () => {
  it("局部明暗中的浮层挂回最近的作用域，不继承外层主题", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    cleanup.push(() => act(() => root.unmount()));
    act(() =>
      root.render(
        <UiProvider theme="paper" mode="dark">
          <div data-theme="mint" data-mode="light">
            <PortalScope>
              <Popover trigger={<button>局部浮层</button>}>
                <Popover.Body>内容</Popover.Body>
              </Popover>
            </PortalScope>
          </div>
        </UiProvider>
      )
    );
    act(() => element.querySelector("button")?.click());
    const scope = document.querySelector('[role="dialog"]')?.closest("[data-mode]");
    expect(scope?.getAttribute("data-mode")).toBe("light");
    expect(scope?.getAttribute("data-theme")).toBe("mint");
  });

  it("嵌套滚动锁乱序释放后恢复原始状态", () => {
    document.body.style.overflow = "auto";
    const first = lockBodyScroll(document);
    const second = lockBodyScroll(document);
    first();
    expect(document.body.style.overflow).toBe("hidden");
    second();
    expect(document.body.style.overflow).toBe("auto");
    second();
  });
  it("Portal 继承局部主题；表单内部 Tab 不关闭，IME Escape 不关闭", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    cleanup.push(() => act(() => root.unmount()));
    act(() =>
      root.render(
        <UiProvider theme="paper" mode="dark">
          <Popover trigger={<button>编辑</button>}>
            <Popover.Body>
              <input data-autofocus aria-label="第一项" />
              <input aria-label="第二项" />
            </Popover.Body>
          </Popover>
        </UiProvider>
      )
    );
    act(() => element.querySelector("button")!.click());
    const card = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const scope = card.closest("[data-theme]");
    expect(scope?.getAttribute("data-theme")).toBe("paper");
    expect(scope?.getAttribute("data-mode")).toBe("dark");
    const input = card.querySelector("input")!;
    act(() =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
      )
    );
    expect(card.hasAttribute("inert")).toBe(false);
    act(() =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          isComposing: true,
          bubbles: true,
          cancelable: true,
        })
      )
    );
    expect(card.hasAttribute("inert")).toBe(false);
  });
  it("多选可连续切换并保留浮层，表单标签指向触发器", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const root = createRoot(element);
    cleanup.push(() => act(() => root.unmount()));
    function Example() {
      const [value, setValue] = useState<readonly string[]>([]);
      return (
        <>
          <label htmlFor="choices">选项</label>
          <Select
            id="choices"
            multiple
            value={value}
            onValueChange={next => setValue(next)}
            options={[
              { value: "a", label: "甲" },
              { value: "b", label: "乙" },
            ]}
          />
        </>
      );
    }
    act(() => root.render(<Example />));
    const trigger = element.querySelector<HTMLButtonElement>("#choices")!;
    act(() => trigger.click());
    const options = document.querySelectorAll<HTMLElement>('[role="option"]');
    act(() => options[0].click());
    act(() => options[1].click());
    expect(trigger.textContent).toContain("甲、乙");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});
