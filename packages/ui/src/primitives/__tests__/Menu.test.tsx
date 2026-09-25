/**
 * Menu 基础件单测（方案 B「现代产品」定稿，mockups/menu/）：
 * 开合与焦点流向 · 命令项触发即关 / 开关项触发不关（Menu 与 Select 的语义分界）·
 * radio 组互斥 · 键盘全表（导航 / Enter / Esc 不冒泡 / → 子菜单 / ← 收起）·
 * type-ahead · disabled 跳过 · 子菜单层级栈 · 外点关闭 · 右键承载 · 全局单开互斥。
 * jsdom 无布局：定位只验证不崩（引擎数学由 tooltip.test.ts 守护）。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextMenu, Menu } from "../Menu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FILE_MENU = (
  <>
    <Menu.Item kbd="⌘N" onSelect={() => undefined}>
      新建卡片
    </Menu.Item>
    <Menu.Item disabled onSelect={() => undefined}>
      保存
    </Menu.Item>
    <Menu.Submenu label="导出为">
      <Menu.Item onSelect={() => undefined}>PDF 文档</Menu.Item>
      <Menu.Item onSelect={() => undefined}>Markdown</Menu.Item>
    </Menu.Submenu>
    <Menu.Separator />
    <Menu.Item danger onSelect={() => undefined}>
      移到废纸篓
    </Menu.Item>
  </>
);

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
  const trigger = container.querySelector<HTMLButtonElement>("button");
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
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
const items = (menu: HTMLElement) => [...menu.querySelectorAll("[data-menu-item]")];
const hlItem = (menu: Element): Element | null => {
  const id = menu.getAttribute("aria-activedescendant");
  return id ? menu.querySelector(`[id="${id}"]`) : null;
};
const menusInDoc = () => [...document.querySelectorAll('[role="menu"]')];

describe("Menu（方案 B）", () => {
  let cleanups: Array<() => void> = [];
  afterEach(() => {
    cleanups.forEach(fn => fn());
    cleanups = [];
    vi.restoreAllMocks();
  });

  it("Home/End、checkbox Enter 与 trigger toggle", () => {
    const changed = vi.fn();
    const h = render(
      <Menu trigger={<button>菜单</button>}>
        <Menu.Item>首项</Menu.Item>
        <Menu.CheckboxItem onCheckedChange={changed}>开关</Menu.CheckboxItem>
      </Menu>
    );
    cleanups.push(h.cleanup);
    click(h.trigger);
    key(h.menu, "End");
    expect(hlItem(h.menu)?.textContent).toBe("开关");
    key(h.menu, "Enter");
    expect(changed).toHaveBeenCalledExactlyOnceWith(true);
    expect(h.menu.hasAttribute("inert")).toBe(false);
    key(h.menu, "Home");
    expect(hlItem(h.menu)?.textContent).toBe("首项");
    click(h.trigger);
    expect(h.menu.hasAttribute("inert")).toBe(true);
  });

  it.each([false, true])("子层 Tab 关闭整树且放行默认行为（shift=%s）", shiftKey => {
    const changed = vi.fn();
    const h = render(
      <Menu trigger={<button>菜单</button>} onOpenChange={changed}>
        {FILE_MENU}
      </Menu>
    );
    cleanups.push(h.cleanup);
    click(h.trigger);
    key(h.menu, "ArrowDown");
    key(h.menu, "ArrowRight");
    changed.mockClear();
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      menusInDoc()[1].dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(changed).toHaveBeenCalledExactlyOnceWith(false);
    expect(document.activeElement).toBe(h.trigger);
    expect(h.menu.hasAttribute("inert")).toBe(true);
    expect(menusInDoc()).toHaveLength(1);
  });

  it("子层导航不冒泡改变父层，点击打开的头收起并还焦", () => {
    const h = render(<Menu trigger={<button>菜单</button>}>{FILE_MENU}</Menu>);
    cleanups.push(h.cleanup);
    click(h.trigger);
    key(h.menu, "ArrowDown");
    const head = hlItem(h.menu);
    expect(head).not.toBeNull();
    click(head as Element);
    const sub = menusInDoc()[1]!;
    key(sub, "ArrowDown");
    expect(hlItem(sub)?.textContent).toBe("Markdown");
    expect(hlItem(h.menu)).toBe(head);
    key(sub, "Home");
    expect(hlItem(h.menu)).toBe(head);
    click(head!);
    expect(menusInDoc()).toHaveLength(1);
    expect(document.activeElement).toBe(h.menu);
  });

  it("禁用子菜单不接受点击、hover、键盘和前缀打开", () => {
    vi.useFakeTimers();
    const h = render(
      <Menu trigger={<button>菜单</button>}>
        <Menu.Submenu label="Disabled" disabled>
          <Menu.Item>子项</Menu.Item>
        </Menu.Submenu>
        <Menu.Item>可用</Menu.Item>
      </Menu>
    );
    cleanups.push(h.cleanup);
    try {
      click(h.trigger);
      const head = items(h.menu)[0];
      click(head);
      act(() => {
        head.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
        vi.advanceTimersByTime(300);
      });
      key(h.menu, "Home");
      key(h.menu, "d");
      key(h.menu, "ArrowRight");
      expect(hlItem(h.menu)?.textContent).toBe("可用");
      expect(menusInDoc()).toHaveLength(1);
      expect(head.getAttribute("aria-disabled")).toBe("true");
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["command", "outside", "exclusive"])(
    "受控 open 以 props 为准，%s 使用更新后的回调",
    source => {
      const oldCallback = vi.fn();
      const latest = vi.fn();
      const view = (open: boolean, callback: (open: boolean) => void) => (
        <>
          <Menu trigger={<button>A</button>} open={open} onOpenChange={callback}>
            <Menu.Item>命令</Menu.Item>
          </Menu>
          <Menu trigger={<button>B</button>}>
            <Menu.Item>另一个</Menu.Item>
          </Menu>
        </>
      );
      const h = render(view(false, oldCallback));
      cleanups.push(h.cleanup);
      click(h.trigger);
      expect(oldCallback).toHaveBeenCalledWith(true);
      expect(h.menu.hasAttribute("inert")).toBe(true);
      act(() => h.root.render(view(true, oldCallback)));
      act(() => h.root.render(view(true, latest)));
      oldCallback.mockClear();
      if (source === "command") click(items(h.menu)[0]);
      else if (source === "outside")
        act(() => {
          document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        });
      else click(h.container.querySelectorAll("button")[1]);
      expect(latest).toHaveBeenCalledExactlyOnceWith(false);
      expect(oldCallback).not.toHaveBeenCalled();
      expect(h.menu.hasAttribute("inert")).toBe(false);
      act(() => h.root.render(view(false, latest)));
      expect(h.menu.hasAttribute("inert")).toBe(true);
    }
  );

  it("卸载清理互斥与外点监听，ContextMenu 样式归浮层", () => {
    const changed = vi.fn();
    const h = render(
      <Menu open onOpenChange={changed} trigger={<button>A</button>}>
        <Menu.Item>项</Menu.Item>
      </Menu>
    );
    h.cleanup();
    const next = render(
      <ContextMenu className="min-w-[280px]" content={<Menu.Item>命令</Menu.Item>}>
        <button>区域</button>
      </ContextMenu>
    );
    cleanups.push(next.cleanup);
    act(() => {
      next.trigger.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(next.menu.hasAttribute("inert")).toBe(false);
    expect(next.menu.className).toContain("min-w-[280px]");
    expect(next.menu.className).not.toContain("min-w-[224px]");
    expect(next.container.firstElementChild?.className).toBe("contents");
    act(() => {
      document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(changed).not.toHaveBeenCalled();
  });

  it("渲染：trigger aria 接线、浮层 inert 待命、异构项齐全", () => {
    const h = render(<Menu trigger={<button>文件</button>}>{FILE_MENU}</Menu>);
    cleanups.push(h.cleanup);
    expect(h.trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(h.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(h.menu.hasAttribute("inert")).toBe(true);
    expect(h.menu.querySelectorAll('[role="menuitem"]').length).toBeGreaterThanOrEqual(4);
    expect(h.menu.querySelector('[role="separator"]')).not.toBeNull();
    expect(h.menu.querySelector('[data-danger="true"]')?.textContent).toContain("移到废纸篓");
    // 危险项的实心高亮类存在（形制 B：高亮实心红）
    expect(h.menu.querySelector('[data-danger="true"]')?.className).toContain("bg-danger");
  });

  it("点击 trigger：打开、焦点入浮层、高亮落首项", () => {
    const h = render(<Menu trigger={<button>文件</button>}>{FILE_MENU}</Menu>);
    cleanups.push(h.cleanup);
    click(h.trigger);
    expect(h.trigger.getAttribute("aria-expanded")).toBe("true");
    expect(h.menu.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(h.menu);
    expect(hlItem(h.menu)?.textContent).toContain("新建卡片"); // 首个非 disabled 项
  });

  it("命令项：onSelect 触发、整树关闭、焦点还 trigger", () => {
    const onSelect = vi.fn();
    const h = render(
      <Menu trigger={<button>文件</button>}>
        <Menu.Item onSelect={onSelect}>新建卡片</Menu.Item>
      </Menu>
    );
    cleanups.push(h.cleanup);
    click(h.trigger);
    click(items(h.menu)[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(h.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(h.trigger);
  });

  it("checkbox 项：触发不关闭（连续操作语义）、onCheckedChange 翻转", () => {
    const onCheckedChange = vi.fn();
    function Probe() {
      const [checked, setChecked] = useState(true);
      return (
        <Menu trigger={<button>更多</button>}>
          <Menu.CheckboxItem
            checked={checked}
            onCheckedChange={v => {
              setChecked(v);
              onCheckedChange(v);
            }}
          >
            置顶
          </Menu.CheckboxItem>
        </Menu>
      );
    }
    const h = render(<Probe />);
    cleanups.push(h.cleanup);
    click(h.trigger);
    const box = items(h.menu)[0];
    expect(box.getAttribute("aria-checked")).toBe("true");
    click(box);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
    expect(h.trigger.getAttribute("aria-expanded")).toBe("true"); // 不关闭
    expect(box.getAttribute("aria-checked")).toBe("false");
  });

  it("radio 项：组内互斥、触发不关闭", () => {
    function Probe() {
      const [sort, setSort] = useState("mtime");
      return (
        <Menu trigger={<button>视图</button>}>
          <Menu.RadioGroup value={sort} onValueChange={setSort}>
            <Menu.RadioItem value="mtime">修改时间</Menu.RadioItem>
            <Menu.RadioItem value="title">标题</Menu.RadioItem>
          </Menu.RadioGroup>
        </Menu>
      );
    }
    const h = render(<Probe />);
    cleanups.push(h.cleanup);
    click(h.trigger);
    const radios = items(h.menu);
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    click(radios[1]);
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
    expect(radios[0].getAttribute("aria-checked")).toBe("false");
    expect(h.trigger.getAttribute("aria-expanded")).toBe("true"); // 不关闭
  });

  it("键盘：↓ 跳过 disabled · Enter 触发高亮项 · Esc 关闭且不冒泡", () => {
    const onSelect = vi.fn();
    const windowKeydown = vi.fn();
    window.addEventListener("keydown", windowKeydown);
    cleanups.push(() => window.removeEventListener("keydown", windowKeydown));

    const h = render(
      <Menu trigger={<button>文件</button>}>
        <Menu.Item onSelect={onSelect}>新建卡片</Menu.Item>
        <Menu.Item disabled>保存</Menu.Item>
        <Menu.Item onSelect={onSelect}>页面设置</Menu.Item>
      </Menu>
    );
    cleanups.push(h.cleanup);
    h.trigger.focus();
    key(h.trigger, "ArrowDown"); // 关闭态 ↓ 打开
    expect(h.trigger.getAttribute("aria-expanded")).toBe("true");

    key(h.menu, "ArrowDown"); // 0 → 跳过 1 → 2
    expect(hlItem(h.menu)?.textContent).toContain("页面设置");

    key(h.menu, "Enter"); // 触发高亮项
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(h.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(h.trigger);

    click(h.trigger); // 重新打开后 Esc：只关本层，不冒泡成页面后退
    windowKeydown.mockClear();
    key(h.menu, "Escape");
    expect(h.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(windowKeydown).not.toHaveBeenCalled();
  });

  it("type-ahead：敲字跳到前缀匹配项", () => {
    const h = render(
      <Menu trigger={<button>文件</button>}>
        <Menu.Item>新建卡片</Menu.Item>
        <Menu.Item>导出为</Menu.Item>
      </Menu>
    );
    cleanups.push(h.cleanup);
    click(h.trigger);
    key(h.menu, "导");
    expect(hlItem(h.menu)?.textContent).toContain("导出为");
  });

  it("子菜单：→ 展开（第二层 role=menu）· 子层 Esc 只关子层 · ← 收起", () => {
    const h = render(<Menu trigger={<button>文件</button>}>{FILE_MENU}</Menu>);
    cleanups.push(h.cleanup);
    click(h.trigger);
    key(h.menu, "ArrowDown"); // 打开时高亮「新建卡片」，↓ 跳过 disabled 的保存落「导出为」
    expect(hlItem(h.menu)?.textContent).toContain("导出为");

    key(h.menu, "ArrowRight"); // 展开子菜单
    expect(menusInDoc()).toHaveLength(2);
    const sub = menusInDoc()[1];
    expect(document.activeElement).toBe(sub); // 焦点入子层
    expect(hlItem(sub)?.textContent).toContain("PDF 文档");

    key(sub, "Escape"); // 只关子层
    expect(menusInDoc()).toHaveLength(1);
    expect(h.trigger.getAttribute("aria-expanded")).toBe("true"); // 主层还在
    expect(document.activeElement).toBe(h.menu); // 焦点回主层

    key(h.menu, "ArrowRight"); // 再展开，用 ← 收起
    expect(menusInDoc()).toHaveLength(2);
    key(menusInDoc()[1], "ArrowLeft");
    expect(menusInDoc()).toHaveLength(1);
  });

  it("子菜单：子层命令项触发后整树关闭", () => {
    const onSelect = vi.fn();
    const h = render(
      <Menu trigger={<button>文件</button>}>
        <Menu.Submenu label="导出为">
          <Menu.Item onSelect={onSelect}>PDF 文档</Menu.Item>
        </Menu.Submenu>
      </Menu>
    );
    cleanups.push(h.cleanup);
    click(h.trigger);
    key(h.menu, "ArrowRight");
    const sub = menusInDoc()[1];
    key(sub, "Enter");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(h.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(menusInDoc()).toHaveLength(1); // 只剩常驻主层
  });

  it("fit：主层与子层高度上限都放到视口高度；默认仍是 300px", () => {
    const h = render(
      <Menu trigger={<button>画布</button>} fit>
        <Menu.Submenu label="形状">
          <Menu.Item>矩形</Menu.Item>
        </Menu.Submenu>
      </Menu>
    );
    cleanups.push(h.cleanup);
    click(h.trigger);
    key(h.menu, "ArrowRight");
    const [main, sub] = menusInDoc();
    for (const el of [main, sub]) {
      expect(el.className).toContain("max-h-[calc(100vh-16px)]");
      expect(el.className).not.toContain("max-h-[300px]");
    }
    h.cleanup();
    cleanups = [];

    const d = render(<Menu trigger={<button>文件</button>}>{FILE_MENU}</Menu>);
    cleanups.push(d.cleanup);
    expect(d.menu.className).toContain("max-h-[300px]");
  });

  it("外点关闭：pointerdown 落在组件外时收起", () => {
    const h = render(<Menu trigger={<button>文件</button>}>{FILE_MENU}</Menu>);
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

  it("ContextMenu：区域内右键弹出、命令项触发后关闭", () => {
    const onSelect = vi.fn();
    const h = render(
      <ContextMenu
        content={
          <>
            <Menu.Item onSelect={onSelect}>打开</Menu.Item>
            <Menu.Item danger onSelect={onSelect}>
              删除
            </Menu.Item>
          </>
        }
      >
        <div className="card">卡片行</div>
      </ContextMenu>
    );
    cleanups.push(h.cleanup);
    act(() => {
      h.container
        .querySelector(".card")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    expect(h.menu.hasAttribute("inert")).toBe(false);
    click(items(h.menu)[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(h.menu.hasAttribute("inert")).toBe(true);
  });

  it("全局单开：打开第二个菜单时第一个自动关闭", () => {
    const h = render(
      <div>
        <Menu trigger={<button>A</button>}>
          <Menu.Item>甲</Menu.Item>
        </Menu>
        <Menu trigger={<button>B</button>}>
          <Menu.Item>乙</Menu.Item>
        </Menu>
      </div>
    );
    cleanups.push(h.cleanup);
    const [ta, tb] = h.container.querySelectorAll("button");
    click(ta);
    expect(ta.getAttribute("aria-expanded")).toBe("true");
    click(tb);
    expect(ta.getAttribute("aria-expanded")).toBe("false"); // A 被互斥关闭
    expect(tb.getAttribute("aria-expanded")).toBe("true");
  });

  it("单开互斥不残留：关闭后再开仍正常（僵尸闭包回归）", () => {
    // 修复前：互斥 cleanup 读 closeRef.current（每渲染都是新闭包）→ 永远判不等
    // → 全局残留旧关闭函数 → 再开时被它秒关
    const h = render(
      <Menu trigger={<button>文件</button>}>
        <Menu.Item>甲</Menu.Item>
      </Menu>
    );
    cleanups.push(h.cleanup);
    click(h.trigger);
    expect(h.trigger.getAttribute("aria-expanded")).toBe("true");
    key(h.menu, "Escape"); // 关闭
    expect(h.trigger.getAttribute("aria-expanded")).toBe("false");
    click(h.trigger); // 再开——修复前此处 expanded=false（开即被关）
    expect(h.trigger.getAttribute("aria-expanded")).toBe("true");
  });
});
