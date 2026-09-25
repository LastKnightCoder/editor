import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  createThemeBootstrapScript,
  resolveThemePreference,
  themeRuntimeConfig,
} from "../theme/bootstrap";
import { createThemeRuntime } from "../theme/themeStore";
import { UiProvider } from "../UiProvider";
import { Popover } from "../primitives/Popover";
import { Select } from "../primitives/Select";
import { lockBodyScroll } from "../hooks/lockBodyScroll";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach(dispose => dispose());
  document.body.innerHTML = "";
  localStorage.clear();
});
describe("公共 UI 运行时", () => {
  it("首帧与运行时使用同一主题解析规则，初始化前不读取偏好", () => {
    const element = document.createElement("div");
    let reads = 0;
    const runtime = createThemeRuntime({
      root: () => element,
      storage: () => ({
        getItem: () => {
          reads++;
          return "cocoa";
        },
        setItem: () => {},
      }),
      media: () => null,
    });
    expect(reads).toBe(0);
    const stop = runtime.init();
    expect(reads).toBe(1);
    expect(element.dataset.theme).toBe("cocoa");
    stop();
    localStorage.setItem("tau-theme", "cocoa");
    new Function(createThemeBootstrapScript())();
    expect(document.documentElement.dataset.theme).toBe(
      resolveThemePreference("cocoa", false, themeRuntimeConfig())
    );
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
        <UiProvider theme="cocoa">
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
    expect(card.closest("[data-theme]")?.getAttribute("data-theme")).toBe("cocoa");
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
