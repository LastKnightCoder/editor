/**
 * Select 基础件单测（数据驱动）：
 * 受控/非受控 · 键盘全表（开合/导航/选中/Esc/焦点归还）· 搜索过滤与空态 ·
 * 分组渲染 · disabled 跳过 · 外点关闭 · aria 接线（combobox/listbox/activedescendant）。
 * jsdom 无布局：定位只验证不崩（引擎数学由 tooltip.test.ts 守护），键盘事件派发到
 * 真实焦点元素（trigger / 搜索框），与用户路径一致。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Select, type SelectOption } from "../Select";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OPTIONS: SelectOption<string>[] = [
  { value: "inbox", label: "收件箱", group: "置顶" },
  { value: "ideas", label: "灵感速记", group: "置顶" },
  { value: "work", label: "工作 · 重构", group: "全部笔记本" },
  { value: "arch", label: "归档（只读）", group: "全部笔记本", disabled: true },
];

interface Harness {
  root: Root;
  container: HTMLElement;
  trigger: HTMLButtonElement;
  menu: HTMLElement;
  cleanup: () => void;
}

function render(ui: ReactNode): Harness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  const trigger = container.querySelector<HTMLButtonElement>('[role="combobox"]:not(input)');
  const menu = document.querySelector<HTMLElement>('[role="listbox"]');
  return {
    root,
    container,
    trigger: trigger as HTMLButtonElement,
    menu: menu as HTMLElement,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const key = (el: Element, k: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });
const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
/** 受控 input 赋值要走原生 setter（React 的 value tracker 会拦截直接 .value 赋值） */
const typeInto = (input: HTMLInputElement, text: string) =>
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
/** activedescendant 指向的选项（id 含冒号，走属性选择器避开 CSS.escape 的环境差异） */
const hlOption = (menu: HTMLElement): Element | null => {
  const id = menu.getAttribute("aria-activedescendant");
  return id ? menu.querySelector(`[id="${id}"]`) : null;
};
const options = (menu: HTMLElement) => [...menu.querySelectorAll('[role="option"]')];

describe("Select（数据驱动）", () => {
  let cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.forEach(fn => fn());
    cleanups = [];
    vi.restoreAllMocks();
  });

  it("渲染：placeholder 上屏、combobox 语义、弹层 aria-hidden 待命", () => {
    const h = render(<Select options={OPTIONS} placeholder="选择笔记本" />);
    cleanups.push(h.cleanup);
    expect(h.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(h.trigger.textContent).toContain("选择笔记本");
    expect(h.menu.getAttribute("aria-hidden")).toBe("true");
    expect(options(h.menu)).toHaveLength(4);
  });

  it("defaultValue 非受控：初始回填对应 label", () => {
    const h = render(<Select options={OPTIONS} defaultValue="work" />);
    cleanups.push(h.cleanup);
    expect(h.trigger.textContent).toContain("工作 · 重构");
  });

  it("点击开合 + 选项点击：onValueChange 收值、回填、关闭、焦点归还", () => {
    const onValueChange = vi.fn();
    const h = render(<Select options={OPTIONS} onValueChange={onValueChange} />);
    cleanups.push(h.cleanup);
    click(h.trigger);
    expect(h.trigger.getAttribute("aria-expanded")).toBe("true");
    expect(h.menu.getAttribute("aria-hidden")).toBe("false");

    click(options(h.menu)[1]);
    expect(onValueChange).toHaveBeenCalledWith("ideas");
    expect(h.trigger.textContent).toContain("灵感速记");
    expect(h.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(h.trigger);
  });

  it("键盘全表（非 searchable）：↑↓ 导航 → Enter 选中 → Esc 关闭不冒泡", () => {
    const onValueChange = vi.fn();
    const windowKeydown = vi.fn();
    window.addEventListener("keydown", windowKeydown);
    cleanups.push(() => window.removeEventListener("keydown", windowKeydown));

    const h = render(
      <Select options={OPTIONS} defaultValue="inbox" onValueChange={onValueChange} />
    );
    cleanups.push(h.cleanup);
    h.trigger.focus();

    // 关闭态 ↓ 打开并高亮当前值（inbox = index 0）
    key(h.trigger, "ArrowDown");
    expect(h.trigger.getAttribute("aria-expanded")).toBe("true");
    expect(hlOption(h.menu)?.textContent).toContain("收件箱");

    // ↓↓：0 → 1（灵感速记）
    key(h.trigger, "ArrowDown");
    expect(hlOption(h.menu)?.textContent).toContain("灵感速记");

    // Enter 选中
    key(h.trigger, "Enter");
    expect(onValueChange).toHaveBeenCalledWith("ideas");
    expect(h.trigger.textContent).toContain("灵感速记");

    // 重新打开后 Esc：关闭且事件不冒泡到 window（焦点链 LIFO 的关键）
    key(h.trigger, "ArrowDown");
    windowKeydown.mockClear();
    key(h.trigger, "Escape");
    expect(h.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(windowKeydown).not.toHaveBeenCalled();
  });

  it("disabled 选项：导航跳过、Enter 不触发 onValueChange", () => {
    const onValueChange = vi.fn();
    const h = render(<Select options={OPTIONS} onValueChange={onValueChange} />);
    cleanups.push(h.cleanup);
    h.trigger.focus();
    key(h.trigger, "ArrowDown"); // 打开，高亮 index 0

    // End 直达末项（disabled 的 arch），不落高亮
    key(h.trigger, "End");
    expect(hlOption(h.menu)?.textContent).toContain("收件箱");

    // 连按 ↓ 环游：1 → 2 →（跳过 3）→ 0
    key(h.trigger, "ArrowDown");
    key(h.trigger, "ArrowDown");
    key(h.trigger, "ArrowDown");
    expect(hlOption(h.menu)?.textContent).toContain("收件箱");

    // 直接点击 disabled 选项：无值回调
    click(options(h.menu)[3]);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("searchable：搜索框聚焦、边输边过滤、空态文案、选中后清词", () => {
    const h = render(<Select options={OPTIONS} searchable emptyText="没有匹配的笔记本" />);
    cleanups.push(h.cleanup);
    click(h.trigger);

    const input = h.menu.querySelector<HTMLInputElement>("input");
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);

    typeInto(input!, "记");
    expect(options(h.menu)).toHaveLength(1); // 「记」只命中灵感速记
    expect(options(h.menu)[0].textContent).toContain("灵感速记");

    typeInto(input!, "不存在");
    expect(h.menu.textContent).toContain("没有匹配的笔记本");

    // 重新打开后搜索词被清空（关闭即清）
    key(h.menu, "Escape");
    click(h.trigger);
    expect(h.menu.querySelector<HTMLInputElement>("input")!.value).toBe("");
  });

  it("分组：group 字段按首现顺序渲染组标签", () => {
    const h = render(<Select options={OPTIONS} />);
    cleanups.push(h.cleanup);
    expect(h.menu.textContent).toContain("置顶");
    expect(h.menu.textContent).toContain("全部笔记本");
    // 组标签在选项之前（DOM 顺序）
    expect(h.menu.textContent?.indexOf("置顶")).toBeLessThan(
      h.menu.textContent?.indexOf("收件箱") ?? -1
    );
  });

  it("受控 value + open：外部驱动回显与常显打开态（样板间标本模式）", () => {
    function Probe() {
      const [v, setV] = useState("work");
      return <Select options={OPTIONS} value={v} onValueChange={setV} open />;
    }
    const h = render(<Probe />);
    cleanups.push(h.cleanup);
    expect(h.trigger.textContent).toContain("工作 · 重构");
    expect(h.trigger.getAttribute("aria-expanded")).toBe("true");

    // 受控 value：点击选项 → onValueChange 更新 → 回显跟随
    click(options(h.menu)[0]);
    expect(h.trigger.textContent).toContain("收件箱");
    // open 受控恒 true：菜单保持打开（由调用方管理关闭）
    expect(h.trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("外点关闭：pointerdown 落在组件外时收起", () => {
    const h = render(<Select options={OPTIONS} />);
    cleanups.push(h.cleanup);
    click(h.trigger);
    expect(h.trigger.getAttribute("aria-expanded")).toBe("true");

    const outsider = document.createElement("div");
    document.body.appendChild(outsider);
    cleanups.push(() => outsider.remove());
    act(() => {
      outsider.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(h.trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("aria：listbox 语义 + 选项 aria-selected 与高亮两态并存", () => {
    const h = render(<Select options={OPTIONS} defaultValue="ideas" />);
    cleanups.push(h.cleanup);
    click(h.trigger);
    const sel = options(h.menu).find(o => o.getAttribute("aria-selected") === "true");
    expect(sel?.textContent).toContain("灵感速记");
    // 选中行与高亮行初始重合，activedescendant 指向它
    expect(h.menu.getAttribute("aria-activedescendant")).toBe(sel?.id);
  });
});
