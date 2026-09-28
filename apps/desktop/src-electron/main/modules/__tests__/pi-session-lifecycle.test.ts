/**
 * 宿主会话生命周期（M4-e）：同一文件只允许一个宿主（空闲顶替、忙的拒绝）、空闲回收、切库释放旧库空闲会话。
 * 忙（在跑 / 等审批 / 等作答）的会话任何时候都不动。
 */
import { describe, expect, it } from "vitest";
import {
  IDLE_DISPOSE_MS,
  idleSessionsOfOtherLibraries,
  idleSessionsToDispose,
  resolveFileConflict,
  type HostedSessionState,
} from "../pi-session-lifecycle";

const state = (
  id: string,
  file: string | undefined,
  patch: Partial<HostedSessionState> = {}
): HostedSessionState => ({ id, file, busy: false, lastActive: 0, ...patch });

describe("同一文件只能有一个宿主", () => {
  it("已有空闲宿主开着同一文件：顶替（先释放旧的）", () => {
    expect(
      resolveFileConflict([state("old", "/s/a.jsonl"), state("other", "/s/b.jsonl")], "/s/a.jsonl")
    ).toEqual({ dispose: ["old"] });
  });

  it("已有宿主在跑或在等用户：拒绝新建，不打断它", () => {
    expect(
      resolveFileConflict([state("old", "/s/a.jsonl", { busy: true })], "/s/a.jsonl")
    ).toHaveProperty("reject");
  });

  it("草稿首轮（还没有文件）不冲突", () => {
    expect(resolveFileConflict([state("x", undefined)], undefined)).toEqual({ dispose: [] });
  });
});

describe("空闲回收", () => {
  it("空闲超过阈值的回收；忙的、刚活动过的不动", () => {
    const now = IDLE_DISPOSE_MS * 3;
    expect(
      idleSessionsToDispose(
        [
          state("stale", "/s/a", { lastActive: 0 }),
          state("busy-stale", "/s/b", { lastActive: 0, busy: true }),
          state("fresh", "/s/c", { lastActive: now - 1000 }),
        ],
        now
      )
    ).toEqual(["stale"]);
  });
});

describe("切库", () => {
  it("只释放其他库目录里的空闲会话；当前库、扩展会话、忙的都不动；同前缀的库名不误伤", () => {
    const root = "/app/sessions";
    const ids = idleSessionsOfOtherLibraries(
      [
        state("old-lib", "/app/sessions/work/x.jsonl"),
        state("old-busy", "/app/sessions/work/y.jsonl", { busy: true }),
        state("current", "/app/sessions/data/z.jsonl"),
        state("prefix", "/app/sessions/data2/w.jsonl"),
        state("browser", "/app/browser-sessions/abc/v.jsonl"),
        state("draft", undefined),
      ],
      root,
      "/app/sessions/data"
    );
    expect(ids.sort()).toEqual(["old-lib", "prefix"]);
  });

  it("Windows 路径分隔符", () => {
    expect(
      idleSessionsOfOtherLibraries(
        [
          state("a", "C:\\app\\sessions\\work\\x.jsonl"),
          state("b", "C:\\app\\sessions\\data\\y.jsonl"),
        ],
        "C:\\app\\sessions",
        "C:\\app\\sessions\\data"
      )
    ).toEqual(["a"]);
  });
});
