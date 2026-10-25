// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { registerCollaborationIpc } from "../ipc-controller";
import type { CollaborationIpcContext } from "../types";

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>());
vi.mock("electron", () => ({
  ipcMain: {
    handle: (key: string, handler: (...args: any[]) => any) => handlers.set(key, handler),
  },
  BrowserWindow: { fromWebContents: (sender: unknown) => sender },
  app: {},
}));
afterEach(() => handlers.clear());

it("白板房间复用协作码与成员入口，未加入的房间不签发", async () => {
  const room = {
    id: "board-room",
    title: "看板",
    ownerId: "me",
    role: "owner" as const,
    status: "active" as const,
    members: [],
    updatedAt: 1,
    serverUrl: "https://collab.test",
  };
  const issueInvitation = vi.fn(async () => ({ code: "ABCD", expiresAt: Date.now() + 1000 }));
  const request = vi.fn(async () => ({}));
  const context = {
    store: { get: () => null },
    contentState: {},
    client: { request },
    refresh: vi.fn(async () => {}),
    issueInvitation,
    whiteboardRoom: (id: string) => (id === room.id ? room : undefined),
    requireSession: () => {
      throw new Error("这段内容已退出协作");
    },
  } as unknown as CollaborationIpcContext;
  registerCollaborationIpc(context);
  await handlers.get("collaboration:invitation")!({}, room.id);
  expect(issueInvitation).toHaveBeenCalledWith("https://collab.test", "board-room");
  await handlers.get("collaboration:remove-member")!({}, room.id, "guest");
  expect(request).toHaveBeenCalledWith(
    "https://collab.test",
    "/v1/documents/board-room/members/guest",
    "DELETE"
  );
  await expect(handlers.get("collaboration:invitation")!({}, "unknown")).rejects.toThrow(
    "已退出协作"
  );
});
