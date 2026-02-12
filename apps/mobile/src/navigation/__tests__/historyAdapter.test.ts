import { beforeEach, describe, expect, it } from "vitest";
import {
  createHistorySnapshot,
  readHistorySnapshot,
  replaceHistorySnapshot,
  restoreEntriesFromSnapshot,
} from "../historyAdapter";

describe("navigation/historyAdapter", () => {
  beforeEach(() => {
    window.history.replaceState(null, "");
  });

  it("replaceHistorySnapshot 后可通过 readHistorySnapshot 读回完整快照", () => {
    const snapshot = createHistorySnapshot({
      screenStack: [
        {
          id: "root",
          key: "main.home",
          params: {},
          createdAt: 1,
        },
        {
          id: "search",
          key: "screen.search",
          params: {},
          createdAt: 2,
        },
      ],
      overlayStack: [
        {
          id: "preview",
          key: "overlay.cardPreview",
          params: { cardId: 100 },
          createdAt: 3,
        },
      ],
      settingsModuleStack: ["integration"],
    });

    replaceHistorySnapshot(snapshot);

    expect(readHistorySnapshot(window.history.state)).toEqual(snapshot);
  });

  it("非法状态会被 readHistorySnapshot 忽略", () => {
    expect(readHistorySnapshot({})).toBeNull();
    expect(readHistorySnapshot({ mark: "invalid", version: 1 })).toBeNull();
  });

  it("restoreEntriesFromSnapshot 会在无设置页时清空设置模块栈", () => {
    const restored = restoreEntriesFromSnapshot({
      screenStack: [{ key: "main.home", params: {} }],
      overlayStack: [],
      settingsModuleStack: ["theme"],
    });

    expect(restored.screenStack[0].key).toBe("main.home");
    expect(restored.settingsModuleStack).toEqual([]);
  });
});
