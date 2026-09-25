import { beforeEach, describe, expect, it } from "vitest";
import { useProjectTreeExpandedStore } from "../projectTreeExpandedStore";

const DB = "test-db";
const legacyKey = (id: number) => `project-item-${DB}-${id}`;

const store = () => useProjectTreeExpandedStore.getState();

beforeEach(() => {
  window.localStorage.clear();
  useProjectTreeExpandedStore.setState({ folded: {} });
});

describe("projectTreeExpandedStore（折叠状态收口）", () => {
  it("内存未命中时回读旧 key（JSON boolean），历史折叠偏好免迁移生效", () => {
    window.localStorage.setItem(legacyKey(11), "false");
    expect(store().getFolded(DB, 11)).toBe(false);
    window.localStorage.setItem(legacyKey(12), "true");
    expect(store().getFolded(DB, 12)).toBe(true);
  });

  it("无记录或旧 key 损坏时返回 undefined（交给默认展开规则）", () => {
    expect(store().getFolded(DB, 1)).toBeUndefined();
    window.localStorage.setItem(legacyKey(2), "not-json{");
    expect(store().getFolded(DB, 2)).toBeUndefined();
  });

  it("setFolded 同时写内存与旧 key，树视图与思维导图共享同一存储格式", () => {
    store().setFolded(DB, 3, true);
    expect(store().getFolded(DB, 3)).toBe(true);
    expect(window.localStorage.getItem(legacyKey(3))).toBe("true");

    store().setFolded(DB, 3, false);
    expect(store().getFolded(DB, 3)).toBe(false);
    expect(window.localStorage.getItem(legacyKey(3))).toBe("false");
  });

  it("定位脉冲展开目标及祖先并覆盖此前的折叠意图；用户随后折叠再次生效", () => {
    store().setFolded(DB, 1, true);
    store().batchReveal(DB, [1, 11]);
    expect(store().getFolded(DB, 1)).toBe(false);
    expect(store().getFolded(DB, 11)).toBe(false);
    expect(window.localStorage.getItem(legacyKey(1))).toBe("false");

    store().setFolded(DB, 1, true);
    expect(store().getFolded(DB, 1)).toBe(true);

    store().batchReveal(DB, [1]);
    expect(store().getFolded(DB, 1)).toBe(false);
  });

  it("folded 记录引用随写入变化（供 useMemo 依赖驱动导图重算）", () => {
    const before = useProjectTreeExpandedStore.getState().folded;
    store().setFolded(DB, 5, true);
    expect(useProjectTreeExpandedStore.getState().folded).not.toBe(before);
  });
});
