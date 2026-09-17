/**
 * Toast 时长策略单测 —— 载入中常驻只由 type 判断，duration 只约束落定后的停留：
 * resolve / reject 都必须让胶囊按 duration 自动离场（曾因 loading 的 duration 被兜成 0
 * 而永久赖着不走），载入期则恒不离场；悬停冻结要跨过载入→落定的切换。
 * jsdom 无布局：rAF 入场与 220ms 退场缓冲都由 fake timers 推进。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast, ToastHost } from "../Toast";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DEFAULT_DURATION = 3200;
const LEAVE_BUFFER = 220;

let root: Root;
let container: HTMLElement;

const texts = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="status"]')).map(p => p.textContent);
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
/** 让 promise 回调链落地（含 zustand setState → React 重渲染） */
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<ToastHost />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  toast.dismiss();
  vi.useRealTimers();
});

describe("Toast 载入态的时长策略", () => {
  it("promise 兑现：转 success 后按默认时长自动离场", async () => {
    let settle!: (data: string) => void;
    const pending = new Promise<string>(resolve => {
      settle = resolve;
    });
    act(() => {
      void toast.promise(pending, {
        loading: "正在导入数据…",
        success: n => `导入完成 · 共 ${n}`,
      });
    });

    expect(texts()).toContain("正在导入数据…");
    advance(DEFAULT_DURATION * 2);
    expect(texts()).toContain("正在导入数据…");

    act(() => settle("128 条"));
    await flush();
    expect(texts()).toContain("导入完成 · 共 128 条");

    advance(DEFAULT_DURATION + LEAVE_BUFFER);
    expect(texts()).toEqual([]);
  });

  it("promise 拒绝：转 error 后按默认时长自动离场", async () => {
    let fail!: (err: unknown) => void;
    const pending = new Promise<string>((_resolve, reject) => {
      fail = reject;
    });
    act(() => {
      void toast.promise(pending, { loading: "正在导入数据…", error: "导入失败" });
    });

    act(() => fail(new Error("boom")));
    await flush();
    expect(texts()).toContain("导入失败");

    advance(DEFAULT_DURATION + LEAVE_BUFFER);
    expect(texts()).toEqual([]);
  });

  it("toast.loading → toast.resolve：同上，落定起重新计时", async () => {
    let id = 0;
    act(() => {
      id = toast.loading("读取数据库快照");
    });

    // 载入期已消耗的时间不倒扣落定后的停留
    advance(DEFAULT_DURATION);
    expect(texts()).toContain("读取数据库快照");

    act(() => toast.resolve(id, "快照已就绪"));
    expect(texts()).toContain("快照已就绪");
    advance(DEFAULT_DURATION + LEAVE_BUFFER);
    expect(texts()).toEqual([]);
  });

  it("显式 duration 0：载入与落定都常驻，只靠点击关闭", async () => {
    let id = 0;
    act(() => {
      id = toast.loading("正在导入数据…", { duration: 0 });
    });
    act(() => toast.resolve(id, "导入完成"));

    advance(DEFAULT_DURATION * 3);
    expect(texts()).toContain("导入完成");

    act(() => {
      document
        .querySelector<HTMLElement>('[role="status"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    advance(LEAVE_BUFFER);
    expect(texts()).toEqual([]);
  });

  it("悬停冻结跨越落定：指针在胶囊上时转成功不排程，移开后才收尾", async () => {
    let id = 0;
    act(() => {
      id = toast.loading("正在导入数据…");
    });
    const pill = document.querySelector<HTMLElement>('[role="status"]')!;
    // React 的 onMouseEnter/Leave 由 mouseover/mouseout + relatedTarget 合成
    act(() => {
      pill.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body })
      );
    });

    act(() => toast.resolve(id, "导入完成"));
    advance(DEFAULT_DURATION * 2);
    expect(texts()).toContain("导入完成");

    act(() => {
      pill.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body })
      );
    });
    advance(DEFAULT_DURATION + LEAVE_BUFFER);
    expect(texts()).toEqual([]);
  });
});
