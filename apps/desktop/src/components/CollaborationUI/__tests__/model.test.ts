import { describe, expect, it } from "vitest";
import type { CollaborationSession, JoinRequest, Member } from "@tau/collaboration";
import {
  formatInvitationCode,
  leaveIntent,
  othersSummary,
  pendingRequests,
  sortMembers,
} from "../model";

const member = (deviceId: string, patch: Partial<Member> = {}): Member => ({
  deviceId,
  nickname: deviceId,
  role: "editor",
  online: true,
  activity: "viewing",
  ...patch,
});

const session = (patch: Partial<CollaborationSession> = {}): CollaborationSession => ({
  id: "doc",
  title: "分布式系统读书笔记",
  ownerId: "me",
  role: "owner",
  status: "active",
  members: [member("me", { role: "owner", activity: "editing" })],
  updatedAt: 0,
  serverUrl: "https://collab.example",
  connection: "connected",
  pending: false,
  leaving: false,
  ...patch,
});

describe("othersSummary", () => {
  it("只数他人：自己在编辑时不计入", () => {
    expect(othersSummary(session(), "me")).toBe("只有你在");
  });
  it("有人编辑时报编辑人数，否则报在线人数", () => {
    const s = session({
      members: [
        member("me", { role: "owner", activity: "editing" }),
        member("a", { activity: "editing" }),
        member("b"),
        member("c", { online: false }),
      ],
    });
    expect(othersSummary(s, "me")).toBe("1 人正在编辑");
    expect(othersSummary({ ...s, members: s.members.filter(x => x.deviceId !== "a") }, "me")).toBe(
      "1 人在线"
    );
  });
});

describe("sortMembers", () => {
  it("作者在前，其后编辑中 → 在线 → 离线", () => {
    const sorted = sortMembers([
      member("off", { online: false }),
      member("view"),
      member("owner", { role: "owner" }),
      member("edit", { activity: "editing" }),
    ]);
    expect(sorted.map(x => x.deviceId)).toEqual(["owner", "edit", "view", "off"]);
  });
});

describe("pendingRequests", () => {
  const request = (id: string, documentId: string, status: JoinRequest["status"] = "pending") =>
    ({ id, documentId, deviceId: id, nickname: id, status, expiresAt: 0 }) satisfies JoinRequest;
  it("只留待审批，可按内容筛选", () => {
    const list = [request("1", "a"), request("2", "b"), request("3", "a", "approved")];
    expect(pendingRequests(list).map(r => r.id)).toEqual(["1", "2"]);
    expect(pendingRequests(list, "a").map(r => r.id)).toEqual(["1"]);
  });
});

describe("leaveIntent", () => {
  it("作者正常结束共享", () => {
    expect(leaveIntent(session())).toMatchObject({
      action: "leave",
      confirmText: "结束共享",
      blocked: false,
    });
  });
  it("作者仍有未同步改动：禁止结束", () => {
    expect(leaveIntent(session({ pending: true }))).toMatchObject({ blocked: true });
  });
  it("成员有未同步改动：可丢弃改动退出", () => {
    expect(leaveIntent(session({ role: "editor", pending: true }))).toMatchObject({
      action: "leave",
      confirmText: "丢弃改动并退出",
      blocked: false,
    });
  });
  it("连接不可用：改走清理本地记录", () => {
    expect(leaveIntent(session({ connection: "offline" }))).toMatchObject({
      action: "discard",
      confirmText: "清理记录",
    });
    expect(leaveIntent(session({ error: "作者已结束共享", status: "closed" }))).toMatchObject({
      action: "discard",
    });
  });
});

describe("formatInvitationCode", () => {
  it("按 4 位分段，已有短横 / 空白先去掉", () => {
    expect(formatInvitationCode("K7QXM3AZ9BCD")).toBe("K7QX-M3AZ-9BCD");
    expect(formatInvitationCode("K7QX-M3AZ 9BCD")).toBe("K7QX-M3AZ-9BCD");
  });
});
