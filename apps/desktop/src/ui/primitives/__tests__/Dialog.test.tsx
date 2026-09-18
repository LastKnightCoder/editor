/**
 * Dialog/ConfirmDialog 基础件单测（方案 B 定稿 + D-011 嫁接，mockups/dialog/）：
 * 开合与 aria · 关闭矩阵（dismissible / critical 拒绝 / locked 封锁）·
 * 初始焦点策略（data-autofocus / danger 落取消）· Tab 首尾圈闭 · 焦点归还 ·
 * 尺寸档与 width 任意值 · ConfirmDialog 的 type-to-confirm 门槛 / Enter 默认应答 /
 * loading 封锁与即关语义。
 * jsdom 无布局与 WAAPI：抖动只验证不崩（animate 可选链）；退场卸载等真实
 * 200ms 定时（flushAnim）。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "../Dialog";
import { ConfirmDialog } from "../ConfirmDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Harness {
  root: Root;
  container: HTMLElement;
  card: () => HTMLElement | null;
  isOpen: () => boolean;
  setOpen: (v: boolean) => void;
  cleanup: () => void;
}

/** 等待退场定时（200ms 卸载）与进场 rAF 落地 */
async function flushAnim() {
  await act(async () => {
    await new Promise(r => setTimeout(r, 240));
  });
}

/** 受控宿主：Dialog 挂在 body portal，查询走 document */
async function renderControlled(
  render: (api: { open: boolean; change: (v: boolean) => void }) => ReactNode
): Promise<Harness> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const api: {
    change: (v: boolean) => void;
    isOpen: () => boolean;
    setOpen: (v: boolean) => void;
  } = { change: () => undefined, isOpen: () => true, setOpen: () => undefined };
  function Host() {
    const [open, setOpen] = useState(true);
    api.isOpen = () => open;
    api.setOpen = setOpen;
    return render({
      open,
      change: v => {
        api.change(v);
        setOpen(v);
      },
    });
  }
  await act(async () => {
    root.render(<Host />);
  });
  await act(async () => {
    await new Promise(r => setTimeout(r, 30));
  });
  return {
    root,
    container,
    card: () => document.querySelector<HTMLElement>('[role="dialog"]'),
    isOpen: () => api.isOpen(),
    setOpen: (v: boolean) => act(() => api.setOpen(v)),
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
      document.body.innerHTML = "";
    },
  };
}

function keyDown(el: Element, key: string, shift = false) {
  act(() => {
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key, shiftKey: shift, bubbles: true, cancelable: true })
    );
  });
}

function click(el: Element) {
  act(() => el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
}

/** 遮罩 = 卡片外层的 fixed 容器（bg-overlay） */
function maskOf(): HTMLElement {
  return document.querySelector<HTMLElement>(".fixed.inset-0")!;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Dialog", () => {
  it("open 渲染 role/aria-modal/标题/徽标/影响行，关闭后卸载", async () => {
    const h = await renderControlled(({ open, change }) => (
      <Dialog
        open={open}
        onOpenChange={change}
        title="归档卡片"
        context="架构笔记"
        impact="可随时恢复"
      >
        正文
      </Dialog>
    ));
    const card = h.card()!;
    expect(card.getAttribute("aria-modal")).toBe("true");
    expect(card.getAttribute("aria-labelledby")).toBeTruthy();
    expect(card.textContent).toContain("归档卡片");
    expect(card.textContent).toContain("架构笔记");
    expect(card.textContent).toContain("可随时恢复");
    expect(card.textContent).toContain("正文");
    h.setOpen(false);
    await flushAnim();
    expect(h.card()).toBeNull();
    h.cleanup();
  });

  it("dismissible：Esc / 遮罩 / × 均可关；点卡片本体不关", async () => {
    const changes: boolean[] = [];
    const h = await renderControlled(({ open, change }) => (
      <Dialog
        open={open}
        onOpenChange={v => {
          changes.push(v);
          change(v);
        }}
        title="导出"
        footer={<button type="button">取消</button>}
      />
    ));
    const card = h.card()!;
    click(card); // 点卡片不关
    expect(changes).toEqual([]);
    keyDown(card, "Escape");
    expect(changes).toEqual([false]);
    h.setOpen(true);
    click(maskOf());
    expect(changes).toEqual([false, false]);
    h.setOpen(true);
    click(card.querySelector('button[aria-label="关闭"]')!);
    expect(changes).toEqual([false, false, false]);
    h.cleanup();
  });

  it("critical：无 ×，Esc 与遮罩点击均不关", async () => {
    const changes: boolean[] = [];
    const h = await renderControlled(({ open, change }) => (
      <Dialog
        open={open}
        onOpenChange={v => {
          changes.push(v);
          change(v);
        }}
        title="版本冲突"
        critical
        footer={<button type="button">保留我的</button>}
      />
    ));
    const card = h.card()!;
    expect(card.querySelector('button[aria-label="关闭"]')).toBeNull();
    keyDown(card, "Escape");
    click(maskOf());
    expect(changes).toEqual([]);
    expect(h.isOpen()).toBe(true);
    h.cleanup();
  });

  it("locked：一切关闭路径失效（异步进行中）", async () => {
    const changes: boolean[] = [];
    const h = await renderControlled(({ open, change }) => (
      <Dialog
        open={open}
        onOpenChange={v => {
          changes.push(v);
          change(v);
        }}
        title="导出"
        locked
        footer={<button type="button">导出</button>}
      />
    ));
    keyDown(h.card()!, "Escape");
    click(maskOf());
    expect(changes).toEqual([]);
    expect(h.isOpen()).toBe(true);
    h.cleanup();
  });

  it("初始焦点落 data-autofocus；Tab 首尾圈闭；关闭归还触发元素", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "打开";
    document.body.appendChild(trigger);
    act(() => trigger.focus());

    const h = await renderControlled(({ open, change }) => (
      <Dialog
        open={open}
        onOpenChange={change}
        title="新建"
        footer={
          <>
            <button type="button">取消</button>
            <button type="button" data-autofocus>
              创建
            </button>
          </>
        }
      >
        <input />
      </Dialog>
    ));
    const card = h.card()!;
    expect(document.activeElement?.textContent).toBe("创建");

    // 圈闭序列 = 卡片内全部可聚焦元素：× 关闭（首位）→ 取消 → 创建（末位）→ 环回 ×
    const closeBtn = card.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')!;
    const create = [...card.querySelectorAll("button")].find(b => b.textContent === "创建")!;
    act(() => create.focus());
    keyDown(card, "Tab"); // 末位 → 环回首位（×）
    expect(document.activeElement).toBe(closeBtn);
    keyDown(card, "Tab", true); // 首位 → 末位
    expect(document.activeElement).toBe(create);

    h.setOpen(false);
    await flushAnim();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
    h.cleanup();
  });

  it("尺寸档与 width 任意值", async () => {
    const h = await renderControlled(({ open, change }) => (
      <Dialog
        open={open}
        onOpenChange={change}
        title="t"
        size="lg"
        footer={<button type="button">ok</button>}
      />
    ));
    expect(h.card()!.className).toContain("w-[560px]");
    expect(h.card()!.style.width).toBe("");
    h.cleanup();

    const h2 = await renderControlled(({ open, change }) => (
      <Dialog
        open={open}
        onOpenChange={change}
        title="t"
        width={520}
        footer={<button type="button">ok</button>}
      />
    ));
    expect(h2.card()!.style.width).toBe("520px");
    h2.cleanup();
  });
});

describe("ConfirmDialog", () => {
  it("type-to-confirm：错名不解锁、对名解锁、Enter 应答、确认即关、重开重置；danger 焦点落取消", async () => {
    const onConfirm = vi.fn();
    const changes: boolean[] = [];
    const h = await renderControlled(({ open, change }) => (
      <ConfirmDialog
        open={open}
        onOpenChange={v => {
          changes.push(v);
          change(v);
        }}
        title="删除笔记本"
        context="工作 · 重构"
        description="清空后不可撤销。"
        impact="24 张卡片 · 废纸篓保留 30 天"
        confirmText="删除"
        danger
        typeToConfirm="工作 · 重构"
        critical
        onConfirm={onConfirm}
      />
    ));
    const card = h.card()!;
    expect(document.activeElement?.textContent).toBe("取消"); // danger：焦点落取消
    const del = [...card.querySelectorAll("button")].find(b => b.textContent === "删除")!;
    const input = card.querySelector("input")!;
    expect(del.disabled).toBe(true);

    // React 受控 input：原生 value setter + input 事件才能触发 onChange
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const typeValue = (v: string) => {
      act(() => {
        valueSetter.call(input, v);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    typeValue("工作 重构");
    expect(del.disabled).toBe(true); // 错名不解锁
    typeValue("工作 · 重构");
    expect(del.disabled).toBe(false);

    keyDown(card, "Enter"); // 焦点在输入框上 → 默认应答
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(changes).toEqual([false]);
    await flushAnim();
    expect(h.card()).toBeNull();

    h.setOpen(true); // 重开：输入重置、按钮回到禁用
    const input2 = h.card()!.querySelector("input")!;
    const del2 = [...h.card()!.querySelectorAll("button")].find(b => b.textContent === "删除")!;
    expect(input2.value).toBe("");
    expect(del2.disabled).toBe(true);
    h.cleanup();
  });

  it("async onConfirm：自动 loading 封锁，resolve 后关闭、reject 保持打开", async () => {
    let resolveConfirm: () => void = () => undefined;
    let rejectConfirm: (e: unknown) => void = () => undefined;
    const h = await renderControlled(({ open, change }) => (
      <ConfirmDialog
        open={open}
        onOpenChange={change}
        title="导出为 PDF"
        confirmText="导出"
        loadingText="导出中…"
        onConfirm={() =>
          new Promise<void>((res, rej) => {
            resolveConfirm = res;
            rejectConfirm = rej;
          })
        }
      />
    ));
    const okBtn = [...h.card()!.querySelectorAll("button")].find(b => b.textContent === "导出")!;
    click(okBtn);
    await act(async () => {
      await Promise.resolve();
    });
    // loading 态：spinner 文案 + 取消禁用 + Esc 不关
    const busyBtn = [...h.card()!.querySelectorAll("button")].find(
      b => b.textContent === "导出中…"
    )!;
    expect(busyBtn).toBeTruthy();
    expect(busyBtn.getAttribute("aria-busy")).toBe("true");
    keyDown(h.card()!, "Escape");
    expect(h.isOpen()).toBe(true);
    // reject：保持打开（错误就地处理）
    await act(async () => {
      rejectConfirm(new Error("boom"));
      await Promise.resolve();
    });
    expect(h.isOpen()).toBe(true);
    const idleBtn = [...h.card()!.querySelectorAll("button")].find(b => b.textContent === "导出")!;
    expect(idleBtn.getAttribute("aria-busy")).toBeNull();
    // 再次确认，这次 resolve：自动关闭
    click(idleBtn);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      resolveConfirm();
      await Promise.resolve();
    });
    expect(h.isOpen()).toBe(false);
    await flushAnim();
    expect(h.card()).toBeNull();
    h.cleanup();
  });

  it("loading：主按钮 spinner 文案、取消禁用、Esc 不关；非 loading 确认即关", async () => {
    const onConfirm = vi.fn();
    const h = await renderControlled(({ open, change }) => (
      <ConfirmDialog
        open={open}
        onOpenChange={change}
        title="导出为 PDF"
        confirmText="导出"
        loading
        loadingText="导出中…"
        onConfirm={onConfirm}
      />
    ));
    const card = h.card()!;
    const exportBtn = [...card.querySelectorAll("button")].find(b => b.textContent === "导出中…")!;
    expect(exportBtn).toBeTruthy();
    expect(exportBtn.getAttribute("aria-busy")).toBe("true");
    const cancel = [...card.querySelectorAll("button")].find(b => b.textContent === "取消")!;
    expect(cancel.disabled).toBe(true);
    keyDown(card, "Escape");
    expect(h.isOpen()).toBe(true);
    h.cleanup();

    const h2 = await renderControlled(({ open, change }) => (
      <ConfirmDialog
        open={open}
        onOpenChange={change}
        title="归档卡片"
        confirmText="归档"
        onConfirm={onConfirm}
      />
    ));
    const okBtn = [...h2.card()!.querySelectorAll("button")].find(b => b.textContent === "归档")!;
    click(okBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(h2.isOpen()).toBe(false);
    h2.cleanup();
  });
});
