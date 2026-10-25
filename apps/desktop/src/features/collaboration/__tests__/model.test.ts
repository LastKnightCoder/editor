import { describe, expect, it } from "vitest";
import type { CollaborationSession, SharedWhiteboardInfo } from "@tau/collaboration";
import { groupShared, openableSource, resolveShared, sourceInfo } from "../model";

const session = (id: string, patch: Partial<CollaborationSession> = {}): CollaborationSession => ({
  id,
  title: id,
  ownerId: "me",
  role: "owner",
  status: "active",
  members: [],
  updatedAt: 0,
  serverUrl: "https://collab.example",
  connection: "connected",
  pending: false,
  leaving: false,
  ...patch,
});

const joined = (id: string) =>
  session(id, {
    role: "editor",
    members: [
      { deviceId: "jie", nickname: "阿杰", role: "owner", online: true, activity: "editing" },
    ],
  });

const board = (id: string, role: "owner" | "editor"): SharedWhiteboardInfo => ({
  id,
  title: id,
  ownerId: role === "owner" ? "me" : "jie",
  role,
  status: "active",
  members: [],
  updatedAt: 0,
  serverUrl: "https://collab.example",
});

describe("groupShared / resolveShared", () => {
  const list = [joined("j1"), session("o1"), joined("j2"), session("o2")];
  const boards = [board("bj", "editor"), board("bo", "owner")];

  it("我发起的在前、我加入的在后，白板排在同组正文之后，空组不出现", () => {
    expect(
      groupShared(list, boards).map(g => [
        g.label,
        g.sessions.map(s => s.id),
        g.whiteboards.map(w => w.id),
      ])
    ).toEqual([
      ["我发起的", ["o1", "o2"], ["bo"]],
      ["我加入的", ["j1", "j2"], ["bj"]],
    ]);
    expect(groupShared([joined("j1")], []).map(g => g.label)).toEqual(["我加入的"]);
  });

  it("参数命中即选中（正文或白板）；缺省或失效落到侧栏第一项", () => {
    expect(resolveShared(list, boards, "j2")).toMatchObject({ kind: "session", id: "j2" });
    expect(resolveShared(list, boards, "bj")).toMatchObject({ kind: "whiteboard", id: "bj" });
    expect(resolveShared(list, boards, undefined)?.id).toBe("o1");
    expect(resolveShared(list, boards, "gone")?.id).toBe("o1");
    expect(resolveShared([], boards, undefined)).toMatchObject({ kind: "whiteboard", id: "bo" });
    expect(resolveShared([], [], undefined)).toBeUndefined();
  });
});

describe("sourceInfo / openableSource", () => {
  const source = {
    databaseName: "main",
    contentId: 7,
    contentCreatedAt: 0,
    sourceType: "article" as const,
    sourceId: 12,
    sourceTitle: "分布式系统读书笔记",
  };

  it("我发起的显示原内容类型与标题，可跳回原处", () => {
    const s = session("o1", { source });
    expect(sourceInfo(s)).toMatchObject({ typeLabel: "文章", title: "分布式系统读书笔记" });
    expect(openableSource(s)).toBe(source);
  });

  it("我加入的显示「某某的共享」，无原内容入口", () => {
    const s = joined("j1");
    expect(sourceInfo(s).typeLabel).toBe("阿杰 的共享");
    expect(openableSource(s)).toBeUndefined();
  });

  it("通用内容（日记等）没有详情页，不提供跳转", () => {
    expect(
      openableSource(session("d", { source: { ...source, sourceType: "content" } }))
    ).toBeUndefined();
  });
});
