import { registerContentIpc } from "../content-runtime/ipc";
import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { collaborationCommands } from "@/commands/contracts/collaboration";
import { SOURCE_TYPES, type SourceType, type JoinRequestResult } from "@tau/collaboration";
import type { CollaborationIpcContext } from "./types";
import { collaborationImageStorage } from "../../services/collaboration-image-storage";
import type { OwnerImageReply } from "../../../../shared/collaboration-image-storage";

type Commands = typeof collaborationCommands;
type CommandHandler<Key extends keyof Commands> = (
  event: IpcMainInvokeEvent,
  ...args: Parameters<Commands[Key]["call"]>
) => Awaited<ReturnType<Commands[Key]["call"]>> | ReturnType<Commands[Key]["call"]>;

export function registerCollaborationIpc(context: CollaborationIpcContext) {
  registerContentIpc(
    {
      ...context,
      user: () => {
        const state = context.state();
        return {
          id: state.deviceId || context.store.get("localDeviceId", "local"),
          nickname: state.nickname,
        };
      },
    },
    collaborationCommands
  );
  const handle = <Key extends keyof Commands>(key: Key, fn: NoInfer<CommandHandler<Key>>) =>
    ipcMain.handle(collaborationCommands[key].channel, fn);
  handle("state", () => context.state());
  handle("ownerImageConnect", async (event, session: string) => {
    const { getMainWindows } = await import("../../windows");
    if (!getMainWindows().some(window => window.webContents.id === event.sender.id))
      throw new Error("作者图片只能交给主窗口保存");
    collaborationImageStorage.connect(event.sender, session);
  });
  handle("ownerImageRelease", (event, session: string) =>
    collaborationImageStorage.release(event.sender.id, session)
  );
  handle("ownerImageReply", (event, reply: OwnerImageReply) =>
    collaborationImageStorage.reply(event.sender.id, reply)
  );
  // 服务器地址不对用户开放（固定默认服务，开发模式为启动命令指定的本地服务）；本机只改昵称
  handle("setNickname", async (_event, value: unknown) => {
    const nickname = typeof value === "string" ? value.trim() : "";
    if (!nickname || nickname.length > 40) throw new Error("昵称长度应为 1 至 40 个字符");
    const url = context.serverUrl();
    context.store.set("nickname", nickname);
    const identity = await context.client.identity(url);
    await context.client.request(url, "/v1/devices/me", "PATCH", { nickname });
    context.client.saveIdentity(url, { ...identity, nickname });
    await context.refresh();
    return context.state();
  });
  handle(
    "createSharedContent",
    (event, contentId: number, sourceType?: unknown, sourceId?: unknown, sourceTitle?: unknown) => {
      if (
        !Number.isSafeInteger(contentId) ||
        contentId <= 0 ||
        (sourceType !== undefined && !SOURCE_TYPES.includes(sourceType as SourceType)) ||
        (sourceId !== undefined &&
          (typeof sourceId !== "number" || !Number.isSafeInteger(sourceId) || sourceId <= 0)) ||
        (sourceTitle !== undefined && (typeof sourceTitle !== "string" || sourceTitle.length > 500))
      )
        throw new Error("共享参数不合法");
      return context.createContent(
        event,
        contentId,
        sourceType as SourceType | undefined,
        sourceId as number | undefined,
        sourceTitle as string | undefined
      );
    }
  );
  handle("join", async (_event, code: string) => {
    const result = await context.client.request<JoinRequestResult>(
      context.serverUrl(),
      "/v1/join-requests",
      "POST",
      {
        code,
      }
    );
    await context.refresh();
    return result;
  });
  handle("decide", async (_event, id: string, approve: boolean) => {
    await context.client.request(
      context.serverUrl(),
      `/v1/join-requests/${encodeURIComponent(id)}/decision`,
      "POST",
      { approve }
    );
    await context.refresh();
  });
  // 白板房间与正文会话共用协作码和成员入口；权限仍由服务端按设备身份裁决。
  const sharedServerUrl = (id: string) =>
    context.whiteboardRoom(id)?.serverUrl ?? context.requireSession(id).info.serverUrl;
  handle("generateInvitation", async (_event, id: string) => {
    return context.issueInvitation(sharedServerUrl(id), id);
  });
  handle("getCurrentInvitation", (_event, id: string) => {
    sharedServerUrl(id);
    const cached = context.store.get<{ code: string; expiresAt: number } | null>(
      `invitation:${id}`,
      null
    );
    return cached && cached.expiresAt > Date.now() ? cached : null;
  });
  handle("removeMember", async (_event, id: string, memberId: string) => {
    await context.client.request(
      sharedServerUrl(id),
      `/v1/documents/${id}/members/${encodeURIComponent(memberId)}`,
      "DELETE"
    );
    await context.refresh();
  });
  handle("discardLocal", async (_event, id: string) => {
    const session = context.findSession(id);
    if (!session) return;
    const unavailable =
      session.info.leaving ||
      session.info.connection === "offline" ||
      session.info.connection === "error" ||
      Boolean(session.info.error);
    if (!unavailable) throw new Error("协作仍在线，请使用正常的退出操作");
    await context.discardLocal(session);
  });
  handle("leave", async (_event, id: string, discardArg?: boolean) => {
    const discard = discardArg ?? false;
    const session = context.requireSession(id);
    if (session.info.status === "closed") {
      if (session.info.pending && !discard)
        throw new Error("请先同步完成或选择丢弃未同步内容，再清理");
      if (session.info.source) await context.clearBinding(session, discard);
      await context.removeSession(session);
      return;
    }
    if (session.info.pending && !discard)
      throw new Error("PENDING_CHANGES: 还有未同步改动，请等待同步、另存或选择丢弃后退出");
    if (session.info.role === "owner" && session.info.pending)
      throw new Error("请先同步作者的改动，再结束共享");
    await context.prepareLeave(session);
    session.info.leaving = true;
    session.provider?.detach();
    context.changed(session);
    await context.finishLeave(session);
    if (context.findSession(id) === session && session.info.error)
      throw new Error(session.info.error);
  });
}
