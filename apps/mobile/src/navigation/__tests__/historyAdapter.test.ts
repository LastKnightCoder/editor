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
        {
          id: "detail",
          key: "screen.contentDetail",
          params: {
            contentId: 88,
            contentTitle: "引用内容",
            contentType: "card",
            refId: 8,
          },
          createdAt: 3,
        },
      ],
      overlayStack: [
        {
          id: "preview",
          key: "overlay.cardPreview",
          params: {
            cardId: 100,
            ui: {
              scrollTop: 256,
              fullscreen: true,
            },
          },
          createdAt: 4,
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

  it("overlay 参数中的 ui 字段在快照恢复后可读", () => {
    const restored = restoreEntriesFromSnapshot({
      screenStack: [{ key: "main.home", params: {} }],
      overlayStack: [
        {
          key: "overlay.cardPreview",
          params: {
            cardId: 7,
            ui: {
              scrollTop: 321,
              fullscreen: true,
            },
          },
        },
      ],
      settingsModuleStack: [],
    });

    const overlayParams = restored.overlayStack[0]?.params;
    expect(overlayParams?.cardId).toBe(7);
    expect(overlayParams?.ui?.scrollTop).toBe(321);
    expect(overlayParams?.ui?.fullscreen).toBe(true);
  });

  it("同步状态详情模块可在设置页历史快照中恢复", () => {
    const restored = restoreEntriesFromSnapshot({
      screenStack: [
        { key: "main.home", params: {} },
        { key: "screen.settings", params: {} },
      ],
      overlayStack: [],
      settingsModuleStack: ["sync-status-resource"],
    });

    expect(restored.settingsModuleStack).toEqual(["sync-status-resource"]);
  });
});
