/**
 * DatePicker / DateRangePicker 单测（A+ 形态）：
 * 受控/非受控回填 · day 即点即定 · minute 挂起 + 时刻区 + 确定提交 · 时刻自由键入
 * （归一化 / 越界还原 / 网格选格）· 预设即点即定与命中高亮 · 钻取视图 · 键盘
 * （开合 / 方向键 / Enter / Esc 不冒泡）· 范围三道闸（起点 → 终点交换 → 确定）
 * 与预设即选即定 · 外点关闭。
 * jsdom 无布局：定位只验证不崩（引擎数学由 anchoredPosition.test.ts 守护）。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatePicker } from "../DatePicker";
import { DateRangePicker } from "../DateRangePicker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
const key = (el: Element, k: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });
/** 受控 input 赋值走原生 setter（React 的 value tracker 拦截直接赋值） */
const typeInto = (input: HTMLInputElement, text: string) =>
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const blur = (input: HTMLInputElement) =>
  act(() => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("blur"));
  });

interface Harness {
  root: Root;
  container: HTMLElement;
  cleanup: () => void;
}
function render(ui: ReactNode): Harness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return {
    root,
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const panel = () => document.querySelector<HTMLElement>('[role="dialog"]:not([inert])');
const dayCell = (p: HTMLElement, day: number) =>
  [...p.querySelectorAll<HTMLElement>('[role="gridcell"]')].find(
    c => c.textContent === String(day)
  )!;

describe("DatePicker（A+ 单日期）", () => {
  let cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.forEach(fn => fn());
    cleanups = [];
  });

  it("渲染：placeholder 上屏、combobox 语义、弹层 inert 待命", () => {
    const h = render(<DatePicker placeholder="选择日期…" />);
    cleanups.push(h.cleanup);
    const trigger = h.container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.textContent).toContain("选择日期…");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("day 精度：点日期即提交并关闭，值格式 YYYY-MM-DD", () => {
    const onValueChange = vi.fn();
    const h = render(<DatePicker onValueChange={onValueChange} />);
    cleanups.push(h.cleanup);
    const trigger = h.container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    click(trigger);
    const p = panel()!;
    const now = new Date();
    click(dayCell(p, 15));
    expect(onValueChange).toHaveBeenCalledWith(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("15日");
  });

  it("defaultValue 回显 + 受控 value 切换", () => {
    const h = render(<DatePicker defaultValue="2026-09-19" />);
    cleanups.push(h.cleanup);
    const trigger = h.container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    expect(trigger.textContent).toContain("2026年9月19日");
    act(() => h.root.render(<DatePicker value="2026-10-01" defaultValue="2026-09-19" />));
    expect(trigger.textContent).toContain("2026年10月1日");
  });

  it("minute 精度：点日期只挂起，确定才提交 YYYY-MM-DD HH:mm", () => {
    const onValueChange = vi.fn();
    const h = render(<DatePicker precision="minute" onValueChange={onValueChange} />);
    cleanups.push(h.cleanup);
    const trigger = h.container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    click(trigger);
    const p = panel()!;
    const now = new Date();
    click(dayCell(p, 20));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(trigger.getAttribute("aria-expanded")).toBe("true"); // 面板不关
    const timeInput = p.querySelector<HTMLInputElement>('input[aria-label="时刻"]')!;
    typeInto(timeInput, "10:37");
    blur(timeInput);
    click(
      [...p.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "确定")!
    );
    expect(onValueChange).toHaveBeenCalledWith(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-20 10:37`
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("10:37");
  });

  it("时刻键入：宽松写法归一化、越界失焦还原", () => {
    const h = render(<DatePicker precision="minute" defaultValue="2026-09-19 09:00" />);
    cleanups.push(h.cleanup);
    click(h.container.querySelector('[role="combobox"]')!);
    const input = panel()!.querySelector<HTMLInputElement>('input[aria-label="时刻"]')!;
    typeInto(input, "9:5");
    blur(input);
    expect(input.value).toBe("09:05");
    typeInto(input, "99");
    blur(input);
    expect(input.value).toBe("09:05"); // 还原上次有效值
    typeInto(input, "14:30");
    blur(input);
    const p = panel()!;
    click(
      [...p.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "确定")!
    );
    expect(h.container.querySelector('[role="combobox"]')!.textContent).toContain("14:30");
  });

  it("时刻网格：选格即填入收起", () => {
    const h = render(<DatePicker precision="minute" />);
    cleanups.push(h.cleanup);
    click(h.container.querySelector('[role="combobox"]')!);
    const p = panel()!;
    click(p.querySelector<HTMLButtonElement>('[aria-label="时刻网格"]')!);
    const grid = p.querySelector<HTMLElement>('[role="listbox"]')!;
    click(
      [...grid.querySelectorAll<HTMLElement>('[role="option"]')].find(
        o => o.textContent === "16:45"
      )!
    );
    expect(p.querySelector<HTMLInputElement>('input[aria-label="时刻"]')!.value).toBe("16:45");
    expect(p.querySelector('[role="listbox"]')).toBeNull(); // 收起
  });

  it("presets：即点即定提交关闭，命中高亮回显", () => {
    const onValueChange = vi.fn();
    const presets = [{ label: "圣诞", value: () => "2026-12-25" }];
    const h = render(<DatePicker presets={presets} onValueChange={onValueChange} />);
    cleanups.push(h.cleanup);
    const trigger = h.container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    click(trigger);
    const p = panel()!;
    click(
      [...p.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "圣诞")!
    );
    expect(onValueChange).toHaveBeenCalledWith("2026-12-25");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("12月25日");
    click(trigger);
    const chip = [...panel()!.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent === "圣诞"
    )!;
    expect(chip.dataset.on).toBeDefined(); // 命中 chip 高亮
  });

  it("钻取：点标题进月视图（12 格）再选月回 days", () => {
    const h = render(<DatePicker />);
    cleanups.push(h.cleanup);
    click(h.container.querySelector('[role="combobox"]')!);
    const p = panel()!;
    click(
      [...p.querySelectorAll<HTMLButtonElement>("button")].find(
        b => b.getAttribute("aria-live") === "polite"
      )!
    );
    const monthButtons = [...p.querySelectorAll<HTMLButtonElement>("[aria-pressed]")];
    expect(monthButtons).toHaveLength(12);
    click(monthButtons[11]); // 12 月
    expect(p.querySelectorAll('[role="gridcell"]')).toHaveLength(42); // 回 days
    expect(
      [...p.querySelectorAll<HTMLButtonElement>("button")].find(
        b => b.getAttribute("aria-live") === "polite"
      )!.textContent
    ).toContain("12月");
  });

  it("键盘：Enter 开面板 → 方向键移动高亮 → Enter 提交 → Esc 关闭不冒泡", () => {
    const onValueChange = vi.fn();
    const h = render(<DatePicker onValueChange={onValueChange} />);
    cleanups.push(h.cleanup);
    const trigger = h.container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    key(trigger, "ArrowDown");
    const p = panel()!;
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const cal = p.querySelector<HTMLElement>("[data-calendar-panel]")!; // 焦点落在网格容器
    const hlBefore = p.querySelector('[data-hl="true"]');
    expect(hlBefore).not.toBeNull();
    key(cal, "ArrowRight");
    expect(p.querySelector('[data-hl="true"]')).not.toBe(hlBefore);
    key(cal, "Enter");
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    click(trigger);
    const stopped = vi.fn();
    document.addEventListener("keydown", stopped);
    key(p, "Escape");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(stopped).not.toHaveBeenCalled(); // Esc 不冒泡成页面后退
    document.removeEventListener("keydown", stopped);
  });

  it("isDateDisabled：禁用日点不动、Enter 不触发", () => {
    const onValueChange = vi.fn();
    const h = render(
      <DatePicker onValueChange={onValueChange} isDateDisabled={d => d.endsWith("-15")} />
    );
    cleanups.push(h.cleanup);
    click(h.container.querySelector('[role="combobox"]')!);
    const p = panel()!;
    expect(dayCell(p, 15).dataset.disabled).toBeDefined();
    click(dayCell(p, 15));
    expect(onValueChange).not.toHaveBeenCalled();
    click(dayCell(p, 16));
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it("外点关闭", () => {
    const h = render(<DatePicker />);
    cleanups.push(h.cleanup);
    const trigger = h.container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    click(trigger);
    expect(panel()).not.toBeNull();
    act(() => {
      document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("DateRangePicker（范围三道闸）", () => {
  let cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.forEach(fn => fn());
    cleanups = [];
  });

  it("双月渲染：两个面板、相邻月份", () => {
    const h = render(<DateRangePicker />);
    cleanups.push(h.cleanup);
    click(h.container.querySelector('[role="combobox"]')!);
    const p = panel()!;
    const grids = [...p.querySelectorAll<HTMLElement>('[aria-label][role="grid"]')];
    expect(grids.length).toBeGreaterThanOrEqual(2);
  });

  it("手选范围：起点 → 终点（反序自动交换）→ 确定提交升序对并关闭", () => {
    const onValueChange = vi.fn();
    const h = render(<DateRangePicker onValueChange={onValueChange} />);
    cleanups.push(h.cleanup);
    const trigger = h.container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    click(trigger);
    const p = panel()!;
    const now = new Date();
    const mm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const apply = [...p.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent === "确定"
    )!;
    click(dayCell(p, 20));
    expect(apply.disabled).toBe(true); // 未选终点不可确定
    expect(onValueChange).not.toHaveBeenCalled();
    click(dayCell(p, 12)); // 反序点选
    click(apply);
    expect(onValueChange).toHaveBeenCalledWith([`${mm}-12`, `${mm}-20`]);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("12日");
    expect(trigger.textContent).toContain("20日");
  });

  it("预设即选即定：提交并关闭、触发器回显", () => {
    const onValueChange = vi.fn();
    const h = render(
      <DateRangePicker
        presets={[{ label: "本月", range: () => ["2026-09-01", "2026-09-30"] }]}
        onValueChange={onValueChange}
      />
    );
    cleanups.push(h.cleanup);
    const trigger = h.container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    click(trigger);
    click(
      [...panel()!.querySelectorAll<HTMLButtonElement>("button")].find(
        b => b.textContent === "本月"
      )!
    );
    expect(onValueChange).toHaveBeenCalledWith(["2026-09-01", "2026-09-30"]);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("9月1日");
    expect(trigger.textContent).toContain("9月30日");
  });

  it("清空：提交 null 并关闭", () => {
    const onValueChange = vi.fn();
    const h = render(
      <DateRangePicker defaultValue={["2026-09-01", "2026-09-30"]} onValueChange={onValueChange} />
    );
    cleanups.push(h.cleanup);
    const trigger = h.container.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    click(trigger);
    click(
      [...panel()!.querySelectorAll<HTMLButtonElement>("button")].find(
        b => b.textContent === "清空"
      )!
    );
    expect(onValueChange).toHaveBeenCalledWith(null);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
