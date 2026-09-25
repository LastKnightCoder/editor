import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CardViewSwitcher } from "../components/CardViewSwitcher";
import type { CardsViewMode } from "../preferences";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let host: HTMLDivElement;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
});

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

async function render(value: CardsViewMode, onChange: (next: CardsViewMode) => void) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<CardViewSwitcher value={value} onChange={onChange} />));
  return host.querySelector("button") as HTMLButtonElement;
}

const menuItems = () => [
  ...(document.querySelector('[role="menu"]') as HTMLElement).querySelectorAll("[data-menu-item]"),
];

it("面包屑触发器回显当前视图，展开后可切到其余视图并即时关闭", async () => {
  const onChange = vi.fn();
  const trigger = await render("wall", onChange);
  expect(trigger.textContent).toContain("卡片墙");

  click(trigger);
  const menu = document.querySelector('[role="menu"]') as HTMLElement;
  expect(menu.hasAttribute("inert")).toBe(false);
  const items = menuItems();
  expect(items.map(item => item.textContent)).toEqual(["卡片墙", "图谱", "表格"]);
  // 当前视图靠高亮标记（accent 色接管 ink-1，非 radio 语义）
  expect(items[0].className).toContain("text-accent-text");
  expect(items[0].className).not.toContain("text-ink-1");
  expect(items[0].getAttribute("role")).toBe("menuitem");
  expect(items[1].className).not.toContain("text-accent-text");

  click(items[2]);
  expect(onChange).toHaveBeenCalledExactlyOnceWith("database");
  // 命令项触发即关（不是 radio 的“不关闭”语义），焦点还给触发器
  expect(menu.hasAttribute("inert")).toBe(true);
  expect(document.activeElement).toBe(trigger);
});

it("选中项跟着 value 走，Esc 关闭浮层", async () => {
  const onChange = vi.fn();
  const trigger = await render("graph", onChange);
  expect(trigger.textContent).toContain("图谱");

  click(trigger);
  const items = menuItems();
  expect(items[1].className).toContain("text-accent-text");
  expect(items[0].className).not.toContain("text-accent-text");

  act(() => {
    items[1].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
  });
  expect((document.querySelector('[role="menu"]') as HTMLElement).hasAttribute("inert")).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
});
