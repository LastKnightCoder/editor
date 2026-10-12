/**
 * Notification 行为单测 —— 停留策略（纯告知自动关 / sticky 常驻 / 悬停冻结）、
 * 作答流程（异步 loading → 结果行 → 退场；拒绝 → 卡内报错并解锁）、同 id 去重、
 * 卡栈叠层（只完整显示最新 3 张，「还有 N 条」为不可点计数标签）、宿主 props
 * （autoDismiss / placement 的 bottom 镜像）、系统通知窗口桥接（isActive /
 * onItemsChange / onCardClick）。jsdom 无布局：高度全为 0 不影响行为断言；
 * rAF 入场与退场缓冲由 fake timers 推进。
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

  it("超过 3 张：只 3 张非叠层，「还有 N 条」是不可点计数标签，无「收起」按钮", () => {
    act(() => {
      for (let i = 1; i <= 5; i++) notify({ title: `通知 ${i}`, sticky: true });
    });
    expect(cards().filter(c => c.hasAttribute("inert"))).toHaveLength(2);
    expect(cards().filter(c => !c.hasAttribute("aria-hidden"))).toHaveLength(3);
    const more = Array.from(document.querySelectorAll<HTMLElement>("span")).find(
      el => el.textContent === "还有 2 条"
    );
    expect(more).toBeTruthy();
    expect(more!.closest("button")).toBeNull();
    expect(
      Array.from(document.querySelectorAll("button")).find(b => b.textContent === "收起")
    ).toBeUndefined();
  });

  it("「全部清除」后全部进入退场", () => {
    act(() => {
      for (let i = 1; i <= 5; i++) notify({ title: `通知 ${i}`, sticky: true });
    });
    act(() => button("全部清除").click());
    // 退场动画中卡仍在 DOM，但全部 inert
    expect(cards()).toHaveLength(5);
    expect(cards().every(c => c.hasAttribute("inert"))).toBe(true);
    advance(LEAVE_BUFFER);
    expect(cards()).toHaveLength(0);
  });

  it("关闭一张完整显示的卡后，后面的卡依次补位（原第 4 张变为非叠层）", () => {
    act(() => {
      for (let i = 1; i <= 5; i++) notify({ id: `n${i}`, title: `通知 ${i}`, sticky: true });
    });
    // 最新的在前：n5/n4/n3 完整显示，n2/n1 叠层
    expect(cards().filter(c => c.hasAttribute("inert"))).toHaveLength(2);

    act(() =>
      cards()[0]
        .querySelector('button[aria-label="关闭通知"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }))
    );
    advance(LEAVE_BUFFER);
    const remaining = cards();
    expect(remaining).toHaveLength(4);
    expect(remaining.filter(c => c.hasAttribute("inert"))).toHaveLength(1);
    const fourth = remaining.find(c => c.textContent?.includes("通知 2"))!;
    expect(fourth.hasAttribute("inert")).toBe(false);
    expect(fourth.hasAttribute("aria-hidden")).toBe(false);
  });
});

describe("NotificationHost props", () => {
  it("autoDismiss=false：非 sticky 卡也不自动关闭", () => {
    act(() => root.render(<NotificationHost autoDismiss={false} />));
    act(() => void notify({ title: "站点已发布", source: "发布", tone: "ok" }));
    advance(20_000);
    expect(cards()).toHaveLength(1);
  });

  it("placement=bottom-right：卡片 bottom 锚定，translateY 非正（第二张为负）", () => {
    act(() => root.render(<NotificationHost placement="bottom-right" />));
    act(() => {
      notify({ title: "通知 1", sticky: true });
      notify({ title: "通知 2", sticky: true });
    });
    expect(cards()[0].className).toContain("bottom-[12px]");
    expect(cards()[0].className).toContain("origin-top");
    const translateY = (el: HTMLElement) => {
      const m = /translate\([^,]+,\s*(-?[\d.]+)px\)/.exec(el.style.transform);
      return Number(m?.[1]);
    };
    expect(translateY(cards()[0])).toBeLessThanOrEqual(0);
    expect(translateY(cards()[1])).toBeLessThan(0);
  });
});

describe("notify.isActive", () => {
  it("推入后为 true；dismiss 即 false（退场动画中不算活跃），移除完成后仍 false", () => {
    const id = notify({ title: "新版本已就绪", sticky: true });
    expect(notify.isActive(id)).toBe(true);

    act(() => notify.dismiss(id));
    expect(notify.isActive(id)).toBe(false);

    advance(LEAVE_BUFFER);
    expect(notify.isActive(id)).toBe(false);
  });

  it("不存在的 id 恒为 false", () => {
    expect(notify.isActive("nope")).toBe(false);
  });
});

describe("NotificationHost 桥接回调（系统通知窗口）", () => {
  it("onItemsChange：挂载回报当前列表，推入与移除（退场完成后）回报增减，退场中不回报", () => {
    const onItemsChange = vi.fn();
    // key 强制重挂载：挂载回报只在带回调的 Host 首次 mount 时发生（通知窗口的真实形态）
    act(
      () =>
        void root.render(
          <NotificationHost key="bridge" autoDismiss={false} onItemsChange={onItemsChange} />
        )
    );
    expect(onItemsChange).toHaveBeenCalledTimes(1);
    expect(onItemsChange).toHaveBeenLastCalledWith([]);

    act(() => {
      notify({ id: "a", title: "站点已发布", sticky: true });
      notify({ id: "b", title: "任务即将到期", sticky: true });
    });
    expect(onItemsChange).toHaveBeenLastCalledWith(["b", "a"]);

    act(() => notify.dismiss("a"));
    // a 还在退场缓冲期内（未从 store 移除）：列表不变，不回报
    expect(onItemsChange).toHaveBeenCalledTimes(2);

    advance(LEAVE_BUFFER);
    expect(onItemsChange).toHaveBeenLastCalledWith(["b"]);
  });

  it("onItemsChange：原位更新（同 id 重发）不触发回报", () => {
    const onItemsChange = vi.fn();
    act(() => root.render(<NotificationHost autoDismiss={false} onItemsChange={onItemsChange} />));
    act(() => notify({ id: "a", title: "第一版", sticky: true }));
    const calls = onItemsChange.mock.calls.length;

    act(() => notify({ id: "a", title: "第二版", sticky: true }));
    expect(onItemsChange.mock.calls.length).toBe(calls);
  });

  it("onCardClick：点击非叠层卡主体触发，点击卡内按钮不触发", () => {
    const onCardClick = vi.fn();
    act(() => root.render(<NotificationHost autoDismiss={false} onCardClick={onCardClick} />));
    act(() => notify({ id: "a", title: "新版本已就绪", body: "已在后台下载完成。", sticky: true }));
    const card = cards()[0];

    act(() => card.querySelector("p")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onCardClick).toHaveBeenCalledTimes(1);
    expect(onCardClick).toHaveBeenCalledWith("a");

    act(() =>
      card
        .querySelector('button[aria-label="关闭通知"]')!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }))
    );
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });

  it("onCardClick：叠层卡点击不触发上报，也不改变叠层状态", () => {
    const onCardClick = vi.fn();
    act(() => root.render(<NotificationHost autoDismiss={false} onCardClick={onCardClick} />));
    act(() => {
      for (let i = 1; i <= 4; i++) notify({ id: `n${i}`, title: `通知 ${i}`, sticky: true });
    });
    const layered = cards().find(c => c.hasAttribute("inert"))!;
    expect(layered).toBeTruthy();

    act(() => layered.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onCardClick).not.toHaveBeenCalled();
    expect(layered.hasAttribute("inert")).toBe(true);
  });

  it("onCardClick：非叠层卡带 cursor-pointer", () => {
    act(() => root.render(<NotificationHost autoDismiss={false} onCardClick={() => undefined} />));
    act(() => notify({ id: "a", title: "t", sticky: true }));
    expect(cards()[0].className).toContain("cursor-pointer");
  });
});
