import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveContentTarget } from "../resolver";
import {
  upsertActiveEditingSession,
  removeActiveEditingSession,
  setActiveEditingSessionFocus,
} from "../active-editor-session";

vi.mock("@/commands/content", () => ({ getContentById: vi.fn() }));

const sessions = new Set<string>();
afterEachCleanup();

function afterEachCleanup() {
  beforeEach(() => {
    for (const id of sessions) removeActiveEditingSession(id);
    sessions.clear();
  });
}

function registerSession(payload: {
  contentId: number;
  entityType: "card" | "article" | "project-item";
  entityId: number;
  focused?: boolean;
}) {
  const sessionId = `test_${payload.entityId}`;
  upsertActiveEditingSession({
    sessionId,
    contentId: payload.contentId,
    entityType: payload.entityType,
    entityId: payload.entityId,
    content: [],
  });
  sessions.add(sessionId);
  if (payload.focused) setActiveEditingSessionFocus(sessionId, true);
  return sessionId;
}

describe("编辑目标解析", () => {
  it("显式 contentId 不依赖激活会话", async () => {
    expect(await resolveContentTarget({ contentId: 8 })).toEqual({
      contentId: 8,
      source: "explicit",
    });
  });

  it("无显式 contentId 时回退到焦点的编辑会话", async () => {
    const focused = registerSession({
      contentId: 101,
      entityType: "project-item",
      entityId: 12,
      focused: true,
    });
    registerSession({ contentId: 202, entityType: "card", entityId: 33 });
    expect(await resolveContentTarget()).toMatchObject({
      contentId: 101,
      entityType: "project-item",
      entityId: 12,
      sessionId: focused,
      source: "active-session",
    });
  });

  it("无焦点会话时回退到最近更新的会话", async () => {
    registerSession({ contentId: 202, entityType: "card", entityId: 33 });
    expect(await resolveContentTarget()).toMatchObject({
      contentId: 202,
      source: "active-session",
    });
  });

  it("没有激活编辑会话时明确报错", async () => {
    await expect(resolveContentTarget()).rejects.toThrow("TARGET_NOT_FOUND");
  });
});
