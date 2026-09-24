/**
 * Notification 行为单测 —— 停留策略（纯告知自动关 / sticky 常驻 / 悬停冻结）、
 * 作答流程（异步 loading → 结果行 → 退场；拒绝 → 卡内报错并解锁）、同 id 去重、
 * 卡栈叠层（超过 3 张出现「还有 N 条」，点击展开）。
 * jsdom 无布局：高度全为 0 不影响行为断言；rAF 入场与退场缓冲由 fake timers 推进。
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notify, NotificationHost } from "../Notification";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LEAVE_BUFFER = 260;

let root: Root;
let container: HTMLElement;

const cards = () => Array.from(document.querySelectorAll<HTMLElement>('[role="status"]'));
const titles = () => cards().map(c => c.textContent ?? "");
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
const button = (text: string) =>
  Array.from(document.querySelectorAll("button")).find(b => b.textContent === text)!;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<NotificationHost />));
});

afterEach(() => {
  act(() => notify.dismiss());
  advance(LEAVE_BUFFER);
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("Notification 停留策略", () => {
  it("纯告知：默认 8s 后自动离场", () => {
    act(() => void notify({ title: "站点已发布", source: "发布", tone: "ok" }));
    expect(titles()[0]).toContain("站点已发布");
    advance(8000 + LEAVE_BUFFER);
    expect(cards()).toHaveLength(0);
  });

  it("sticky：不自动离场，关闭钮才离场", () => {
    act(() => void notify({ title: "发现新版本 v3.3.0", sticky: true }));
    advance(60_000);
    expect(cards()).toHaveLength(1);
    act(() => button("").click()); // 关闭钮只有图标
    advance(LEAVE_BUFFER);
    expect(cards()).toHaveLength(0);
  });

  it("悬停冻结倒计时，移出后按剩余时间继续", () => {
    act(() => void notify({ title: "站点已发布", duration: 4000 }));
    advance(3000);
    act(() => {
      cards()[0].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    advance(10_000);
    expect(cards()).toHaveLength(1);
    act(() => {
      cards()[0].dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    advance(1000 + LEAVE_BUFFER);
    expect(cards()).toHaveLength(0);
  });
});

describe("Notification 作答", () => {
  it("异步兑现：loading 锁定 → 结果行 → 1.6s 后退场", async () => {
    let settle!: () => void;
    act(
      () =>
        void notify({
          title: "林然申请加入协作",
          avatar: "林",
          sticky: true,
          actions: [
            { label: "拒绝" },
            {
              label: "同意",
              primary: true,
              resolvedText: "已同意林然加入协作",
              onClick: () => new Promise<void>(resolve => (settle = resolve)),
            },
          ],
        })
    );
    act(() => button("同意").click());
    expect(button("同意").getAttribute("aria-busy")).toBe("true");
    expect(button("拒绝").disabled).toBe(true);

    act(() => settle());
    await flush();
    expect(titles()).toEqual(["已同意林然加入协作"]);

    advance(1600 + LEAVE_BUFFER);
    expect(cards()).toHaveLength(0);
  });

  it("异步拒绝：说明位换成错误文案，按钮解锁", async () => {
    let fail!: (err: unknown) => void;
    act(
      () =>
        void notify({
          title: "发布失败",
          body: "3 篇文章的图片上传超时",
          tone: "danger",
          sticky: true,
          actions: [
            {
              label: "重试",
              primary: true,
              onClick: () => new Promise<void>((_r, reject) => (fail = reject)),
            },
          ],
        })
    );
    act(() => button("重试").click());
    act(() => fail(new Error("网络不可用")));
    await flush();
    expect(titles()[0]).toContain("网络不可用");
    expect(button("重试").disabled).toBe(false);
  });

  it("同步动作：点击即离场", () => {
    act(() => void notify({ title: "发现新版本", sticky: true, actions: [{ label: "稍后" }] }));
    act(() => button("稍后").click());
    advance(LEAVE_BUFFER);
    expect(cards()).toHaveLength(0);
  });
});

describe("Notification 去重与卡栈", () => {
  it("同 id 再次 notify 原位更新而非新增", () => {
    act(() => void notify({ id: "app-update", title: "发现新版本 v3.3.0", sticky: true }));
    act(() => void notify({ id: "app-update", title: "发现新版本 v3.3.1", sticky: true }));
    expect(titles()).toHaveLength(1);
    expect(titles()[0]).toContain("v3.3.1");
  });

  it("超过 3 张：叠层 inert，「还有 N 条」点击展开", () => {
    act(() => {
      for (let i = 1; i <= 5; i++) notify({ title: `通知 ${i}`, sticky: true });
    });
    const layered = cards().filter(c => c.hasAttribute("inert"));
    expect(layered).toHaveLength(2);
    act(() => button("还有 2 条").click());
    expect(cards().filter(c => c.hasAttribute("inert"))).toHaveLength(0);
    expect(button("收起")).toBeTruthy();

    act(() => button("全部清除").click());
    advance(LEAVE_BUFFER);
    expect(cards()).toHaveLength(0);
  });
});
