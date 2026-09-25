import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import {
  useProjectTreeExpandedStore,
  openEntryKey,
  readPersistedOpen,
} from "../projectTreeExpandedStore";

const DB = "test-db";
const storageKey = (id: number) => `project-item-${DB}-${id}`;

const store = () => useProjectTreeExpandedStore.getState();

beforeEach(() => {
  window.localStorage.clear();
  useProjectTreeExpandedStore.setState({ open: {} });
});

describe("projectTreeExpandedStore（展开状态收口，值语义 = 是否展开）", () => {
  it("内存未命中时回读持久层（JSON boolean），历史偏好免迁移生效", () => {
    window.localStorage.setItem(storageKey(11), "false");
    expect(store().getOpen(DB, 11)).toBe(false);
    window.localStorage.setItem(storageKey(12), "true");
    expect(store().getOpen(DB, 12)).toBe(true);
  });

  it("无记录或持久层损坏时返回 undefined（交给默认展开规则）", () => {
    expect(store().getOpen(DB, 1)).toBeUndefined();
    window.localStorage.setItem(storageKey(2), "not-json{");
    expect(store().getOpen(DB, 2)).toBeUndefined();
  });

  it("setOpen 同时写内存与持久层，树视图与思维导图共享同一存储格式", () => {
    store().setOpen(DB, 3, false);
    expect(store().getOpen(DB, 3)).toBe(false);
    expect(window.localStorage.getItem(storageKey(3))).toBe("false");

    store().setOpen(DB, 3, true);
    expect(store().getOpen(DB, 3)).toBe(true);
    expect(window.localStorage.getItem(storageKey(3))).toBe("true");
  });

  it("定位脉冲展开目标及祖先并覆盖此前的折叠意图；用户随后折叠再次生效", () => {
    store().setOpen(DB, 1, false);
    store().batchReveal(DB, [1, 11]);
    expect(store().getOpen(DB, 1)).toBe(true);
    expect(store().getOpen(DB, 11)).toBe(true);
    expect(window.localStorage.getItem(storageKey(1))).toBe("true");

    store().setOpen(DB, 1, false);
    expect(store().getOpen(DB, 1)).toBe(false);

    store().batchReveal(DB, [1]);
    expect(store().getOpen(DB, 1)).toBe(true);
  });

  it("open 记录引用随写入变化（供 useMemo 依赖驱动导图重算）", () => {
    const before = useProjectTreeExpandedStore.getState().open;
    store().setOpen(DB, 5, true);
    expect(useProjectTreeExpandedStore.getState().open).not.toBe(before);
  });
});

describe("展开值订阅（定位展开不依赖无关重渲染）", () => {
  const Probe = ({ db, id, defaultOpen }: { db: string; id: number; defaultOpen: boolean }) => {
    const storedOpen = useProjectTreeExpandedStore(state => state.open[openEntryKey(db, id)]);
    const open = storedOpen ?? readPersistedOpen(db, id) ?? defaultOpen;
    return <div data-open={String(open)} />;
  };

  const mount = (id: number, defaultOpen = false) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<Probe db={DB} id={id} defaultOpen={defaultOpen} />);
    });
    return {
      read: () => container.querySelector("[data-open]")!.getAttribute("data-open"),
      unmount: () => act(() => root.unmount()),
    };
  };

  it("历史折叠的深层祖先在 batchReveal 后响应式展开，用户折叠再次生效", () => {
    window.localStorage.setItem(storageKey(11), "false"); // 上次会话折叠过
    const probe = mount(11);
    expect(probe.read()).toBe("false"); // 初始：历史折叠 → 收起

    act(() => {
      store().batchReveal(DB, [11]);
    });
    expect(probe.read()).toBe("true"); // 脉冲后立即重渲染为展开

    act(() => {
      store().setOpen(DB, 11, false); // 用户随后手动折叠
    });
    expect(probe.read()).toBe("false");

    probe.unmount();
  });

  it("默认展开规则：无持久记录时按调用方默认渲染", () => {
    const probe = mount(1, true);
    expect(probe.read()).toBe("true");
    probe.unmount();
  });
});
