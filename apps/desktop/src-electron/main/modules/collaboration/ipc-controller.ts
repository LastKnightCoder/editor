import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import * as Y from "yjs";
import { applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import {
  memberColor,
  SOURCE_TYPES,
  type SourceType,
  type ContentSessionTarget,
} from "@tau/collaboration";
import type { CollaborationIpcContext } from "./types";
import { isVideoFile } from "./asset-service";

export function registerCollaborationIpc(context: CollaborationIpcContext) {
  const handle = <Args extends unknown[]>(
    name: string,
    fn: (event: IpcMainInvokeEvent, ...args: Args) => unknown
  ) => ipcMain.handle(`collaboration:${name}`, fn);
  handle("state", () => context.state());
  handle("open-content", (event, target: ContentSessionTarget) =>
    context.openContent(event, target)
  );
  handle("freeze-ack", (event, viewId: string) => {
    const view = context.views.get(viewId);
    if (view?.windowId === BrowserWindow.fromWebContents(event.sender)?.id)
      context.acknowledgeFreeze(viewId);
  });
  handle("set-tab-active", (_event, id: string, blockId: string, tabKey: string) => {
    context.noteActiveTab(context.requireSession(id), blockId, tabKey);
  });
  // 服务器地址不对用户开放（固定默认服务，开发模式为启动命令指定的本地服务）；本机只改昵称
  handle("set-nickname", async (_event, value: unknown) => {
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
    "create-content",
    (event, contentId: number, sourceType: unknown, sourceId: unknown, sourceTitle: unknown) => {
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
    const result = await context.client.request(context.serverUrl(), "/v1/join-requests", "POST", {
      code,
    });
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
  handle("invitation", async (_event, id: string) => {
    const session = context.requireSession(id);
    return context.issueInvitation(session.info.serverUrl, id);
  });
  handle("invitation-current", (_event, id: string) => {
    context.requireSession(id);
    const cached = context.store.get<{ code: string; expiresAt: number } | null>(
      `invitation:${id}`,
      null
    );
    return cached && cached.expiresAt > Date.now() ? cached : null;
  });
  handle("remove-member", async (_event, id: string, memberId: string) => {
    const session = context.requireSession(id);
    await context.client.request(
      session.info.serverUrl,
      `/v1/documents/${id}/members/${encodeURIComponent(memberId)}`,
      "DELETE"
    );
    await context.refresh();
  });
  handle("subscribe", (event, id: string, viewId: string) => {
    const session = context.requireSession(id);
    if (
      session.info.mode === "local" &&
      context.databaseForEvent(event).name !== session.info.source?.databaseName
    )
      throw new Error("内容不属于当前数据库");
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("窗口已关闭");
    context.views.set(viewId, {
      // 视图按会话当前身份登记：换身份时 rekeySession 会一并改写
      documentId: session.info.id,
      windowId: window.id,
      clientIds: [],
    });
    const awareness = session.awareness;
    const deviceId = context.state().deviceId || context.store.get("localDeviceId", "local");
    return {
      state: Y.encodeStateAsUpdate(session.doc),
      awareness: awareness
        ? encodeAwarenessUpdate(awareness, [...awareness.getStates().keys()])
        : null,
      privateNodes: [...session.privateNodes],
      session: session.info,
      user: {
        id: deviceId,
        name: context.state().nickname,
        color: memberColor(deviceId),
      },
    };
  });
  handle("private-node", (event, id: string, viewId: string, collabId: string, node: unknown) => {
    const session = context.requireSession(id);
    const view = context.views.get(viewId);
    if (
      !view ||
      view.documentId !== session.info.id ||
      view.windowId !== BrowserWindow.fromWebContents(event.sender)?.id ||
      typeof collabId !== "string" ||
      collabId.length > 100 ||
      !node ||
      typeof node !== "object"
    )
      throw new Error("编辑视图已失效");
    const serialized = JSON.stringify(node);
    if (serialized.length > 1024 * 1024) throw new Error("本地组件数据超过大小限制");
    session.privateNodes.set(collabId, JSON.parse(serialized));
    context.store.privateNodes(session.info.id, session.privateNodes);
    session.projectionDirty = true;
  });
  handle("unsubscribe", (_event, viewId: string) => context.removeView(viewId));
  handle("discard-local", async (_event, id: string) => {
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
  handle("update", (event, id: string, update: Uint8Array, viewId?: string) => {
    const session = context.requireSession(id);
    const view = viewId && context.views.get(viewId);
    if (
      viewId &&
      (!view ||
        view.documentId !== session.info.id ||
        view.windowId !== BrowserWindow.fromWebContents(event.sender)?.id)
    )
      throw new Error("编辑视图已失效");
    if (session.info.frozen && (!viewId || !session.drainingViews?.has(viewId)))
      throw new Error("内容正在切换，请稍后重试");
    if (session.info.status !== "active") throw new Error("共享已结束，请先另存内容");
    if (update.byteLength > 8 * 1024 * 1024) throw new Error("编辑更新超过大小限制");
    const bytes = new Uint8Array(update);
    Y.decodeUpdate(bytes);
    context.store.append(session.info.id, bytes);
    Y.applyUpdate(session.doc, bytes, "renderer-persisted");
    context.changed(session);
  });
  handle("awareness", (event, id: string, viewId: string, update: Uint8Array, clientId: number) => {
    const session = context.findSession(id);
    const view = context.views.get(viewId);
    if (
      !session ||
      !view ||
      view.documentId !== session.info.id ||
      view.windowId !== BrowserWindow.fromWebContents(event.sender)?.id ||
      update.byteLength > 16384
    )
      return;
    if (!view.clientIds.includes(clientId)) view.clientIds.push(clientId);
    applyAwarenessUpdate(session.awareness, new Uint8Array(update), "renderer");
  });
  handle("leave", async (_event, id: string, discardArg?: boolean) => {
    const discard = discardArg ?? false;
    const session = context.requireSession(id);
    if (session.info.status === "closed") {
      if (session.info.pending && !discard)
        throw new Error("请先同步完成或选择丢弃未同步内容，再清理");
      if (session.info.source) await context.clearBinding(session, discard);
      context.removeSession(session);
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
  });
  handle(
    "upload-resource",
    async (_event, id: string, file: { name: string; mime: string; bytes: Uint8Array }) => {
      const session = context.requireSession(id);
      // 视频不上传服务器，只在插入者本机可播放，其他成员看到占位
      if (isVideoFile(file)) return context.assets.keepLocalFile(session.info.id, file);
      if (file.bytes.byteLength > 25 * 1024 * 1024) throw new Error("文件超过 25 MB");
      session.provider?.detach();
      const reference = await context.assets.enqueue(session.info.id, file);
      session.info.pending = true;
      context.changed(session);
      void context.flushResources();
      return reference;
    }
  );
  handle("resource", (_event, id: string, reference: string) => {
    const session = context.requireSession(id);
    return context.assets.resolveReference(session.info.serverUrl, session.info.id, reference);
  });
}
