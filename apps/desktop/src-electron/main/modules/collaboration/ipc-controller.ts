import { BrowserWindow, ipcMain, app, type IpcMainInvokeEvent } from "electron";
import { dirname } from "node:path";
import { ContentRecoveryStore } from "./content-recovery";
import type { LocalRecoveryReceipt } from "./content-local-state";
import * as Y from "yjs";
import { applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import {
  memberColor,
  NODE_DOCUMENT_VERSION,
  NodeTree,
  createNodeDocument,
  collectNodeDocumentResources,
  ASSET_PREFIX,
  LOCAL_ASSET_PREFIX,
  type ContentNode,
  type ContentInputDraft,
  SOURCE_TYPES,
  type SourceType,
  type ContentSessionTarget,
} from "@tau/collaboration";
import type { CollaborationIpcContext } from "./types";
import { isVideoFile } from "./asset-service";
import { NodeSessionUpdates } from "./node-session-updates";
import { validateContentContractsSync } from "@tau/db-schema/content-contracts-node";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";

export function registerCollaborationIpc(context: CollaborationIpcContext) {
  const nodeUpdates = new NodeSessionUpdates(context.store, context.contentState);
  const handle = <Args extends unknown[]>(
    name: string,
    fn: (event: IpcMainInvokeEvent, ...args: Args) => unknown
  ) => ipcMain.handle(`collaboration:${name}`, fn);
  handle("state", () => context.state());
  handle(
    "prepare-fragment",
    async (
      event,
      viewId: string,
      sourceId: string,
      content: ContentNode[],
      inputContracts: ContentContractDictionary
    ) => {
      const view = context.views.get(viewId);
      if (!view || view.windowId !== BrowserWindow.fromWebContents(event.sender)?.id)
        throw new Error("粘贴视图已失效");
      const target = context.requireSession(view.documentId);
      if (target.info.frozen) throw new Error("正文正在切换");
      const contracts = validateContentContractsSync(inputContracts);
      const value = { title: "", bannerBg: "", bannerPosition: "center", content };
      const candidate = await createNodeDocument(
        { documentId: "clipboard", baselineId: "clipboard", epoch: 0 },
        value,
        contracts
      );
      const references = collectNodeDocumentResources(candidate).filter(
        reference => reference.startsWith(ASSET_PREFIX) || reference.startsWith(LOCAL_ASSET_PREFIX)
      );
      candidate.destroy();
      const source = context.findSession(sourceId);
      if (references.length) {
        if (!source) throw new Error("附件的原文档尚未打开，请打开后重新复制");
        const allowed = new Set(collectNodeDocumentResources(source.doc));
        if (references.some(reference => !allowed.has(reference)))
          throw new Error("附件不属于复制来源，不能读取");
      }
      const localized = source
        ? await context.assets.localizeDocument(
            source.info.serverUrl,
            source.info.id,
            value,
            contracts
          )
        : value;
      const prepared =
        target.info.mode === "local"
          ? await context.assets.prepareLocalDocument(target.info.id, localized, contracts)
          : await context.assets.shareDocument(
              target.info.serverUrl,
              target.info.id,
              target.info.id,
              localized,
              contracts
            );
      if (
        context.views.get(viewId) !== view ||
        context.findSession(target.info.id) !== target ||
        target.info.frozen
      )
        throw new Error("粘贴视图已切换");
      return prepared.content;
    }
  );
  handle("recoveries", (_event, offset = 0) => {
    if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0)
      throw new Error("恢复清单页码无效");
    const store = new ContentRecoveryStore(dirname(context.store.db.name), context.contentState);
    const receipts = context.contentState.db
      .prepare(
        "SELECT id,manifest_hash AS manifestHash,manifest_path AS manifestPath FROM recoveries ORDER BY rowid DESC LIMIT 30 OFFSET ?"
      )
      .all(offset) as LocalRecoveryReceipt[];
    return receipts.map(receipt => {
      try {
        const manifest = store.manifest(receipt);
        const detached = [...context.sessions.values()].filter(
          session =>
            context.store.get<{ recoveryId: string } | null>(
              `library-detached:${session.info.id}`,
              null
            )?.recoveryId === receipt.id
        );
        return {
          id: receipt.id,
          workspaceId: manifest.workspaceId,
          reason: manifest.reason,
          missing: manifest.missing,
          documents: detached.map(session => ({ id: session.info.id, title: session.info.title })),
        };
      } catch {
        return {
          id: receipt.id,
          workspaceId: "",
          reason: "unreadable",
          missing: [],
          documents: [],
          error: "清单损坏，原文件仍保留",
        };
      }
    });
  });
  handle("export-recovery", async (_event, id: string) => {
    const receipt = context.contentState.recovery(id);
    if (!receipt) throw new Error("恢复包不存在");
    return new ContentRecoveryStore(dirname(context.store.db.name), context.contentState).export(
      receipt,
      app.getPath("downloads")
    );
  });
  handle("use-replaced-content", (event, id: string) => context.useReplacedContent(event, id));
  handle("adopt-remote-version", (event, id: string) => context.adoptRemoteVersion(event, id));
  handle("open-content", (event, target: ContentSessionTarget) =>
    context.openContent(event, target)
  );
  handle(
    "prepare-upgrade",
    (
      event,
      id: string,
      contracts: import("@tau/db-schema/content-contracts").ContentContractDictionary,
      versionUpgrade?: import("@tau/collaboration").ContentVersionUpgrade
    ) => context.prepareContentUpgrade(event, id, contracts, versionUpgrade)
  );
  handle("finish-upgrade", (event, operationId: string, cancel: boolean) =>
    context.finishContentUpgrade(event, operationId, cancel)
  );
  handle("freeze-ack", (event, viewId: string, requestId?: string) => {
    const view = context.views.get(viewId);
    if (view?.windowId === BrowserWindow.fromWebContents(event.sender)?.id)
      context.acknowledgeFreeze(viewId, requestId);
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
  // 白板房间与正文会话共用协作码和成员入口；权限仍由服务端按设备身份裁决。
  const sharedServerUrl = (id: string) =>
    context.whiteboardRoom(id)?.serverUrl ?? context.requireSession(id).info.serverUrl;
  handle("invitation", async (_event, id: string) => {
    return context.issueInvitation(sharedServerUrl(id), id);
  });
  handle("invitation-current", (_event, id: string) => {
    sharedServerUrl(id);
    const cached = context.store.get<{ code: string; expiresAt: number } | null>(
      `invitation:${id}`,
      null
    );
    return cached && cached.expiresAt > Date.now() ? cached : null;
  });
  handle("remove-member", async (_event, id: string, memberId: string) => {
    await context.client.request(
      sharedServerUrl(id),
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
    let workspaceId = session.info.source?.databaseName;
    if (!workspaceId) {
      try {
        workspaceId = context.databaseForEvent(event).name;
      } catch {
        workspaceId = "application";
      }
    }
    context.views.set(viewId, {
      // 视图按会话当前身份登记：换身份时 rekeySession 会一并改写
      documentId: session.info.id,
      windowId: window.id,
      clientIds: [],
      inputIdentity: {
        workspaceId,
        documentId: session.info.id,
        baselineId: String(
          session.doc.getMap("meta").get("baselineId") ?? `legacy:${session.info.id}`
        ),
        epoch: Number(session.doc.getMap("meta").get("epoch") ?? 0),
      },
    });
    const awareness = session.awareness;
    const deviceId = context.state().deviceId || context.store.get("localDeviceId", "local");
    return {
      nodeViews: Object.fromEntries(
        (
          context.contentState.db
            .prepare("SELECT node_id,value FROM node_views WHERE workspace_id=? AND document_id=?")
            .all(workspaceId, session.info.source?.contentDocumentId ?? session.info.id) as {
            node_id: string;
            value: string;
          }[]
        ).map(row => [row.node_id, JSON.parse(row.value)])
      ),
      pendingUpgrade: context.contentState
        .pendingMigrations()
        .some(record => record.plan.documentId === session.info.id),
      state: Y.encodeStateAsUpdate(session.doc),
      awareness: awareness
        ? encodeAwarenessUpdate(awareness, [...awareness.getStates().keys()])
        : null,
      session: session.info,
      user: {
        id: deviceId,
        name: context.state().nickname,
        color: memberColor(deviceId),
      },
    };
  });
  handle("node-view", (event, viewId: string, nodeId: string, patch: Record<string, unknown>) => {
    const view = context.views.get(viewId);
    if (!view || view.windowId !== BrowserWindow.fromWebContents(event.sender)?.id)
      throw new Error("编辑视图已失效");
    const session = context.requireSession(view.documentId);
    if (session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION)
      throw new Error("请先转换旧正文");
    const tree = new NodeTree(session.doc);
    try {
      const contract = tree.contract(nodeId);
      if (!contract) throw new Error("节点已失效");
      const key = {
        workspaceId: view.inputIdentity.workspaceId,
        documentId: session.info.source?.contentDocumentId ?? session.info.id,
        nodeId,
        owner: contract.owner,
      };
      return context.contentState.db.transaction(() => {
        const previous = context.contentState.readView(key);
        const value = { ...previous?.value, ...patch };
        context.contentState.writeView(key, value, previous?.revision ?? null);
        return value;
      })();
    } finally {
      tree.dispose();
    }
  });
  handle("input-draft", (event, viewId: string, draft: ContentInputDraft) => {
    const view = context.views.get(viewId);
    if (!view || view.windowId !== BrowserWindow.fromWebContents(event.sender)?.id)
      throw new Error("输入副本的编辑视图已失效");
    context.contentState.saveInputDraft(view.inputIdentity, viewId, draft);
    try {
      const cached = context.store.load(view.inputIdentity.documentId);
      try {
        nodeUpdates.confirmDrafts(cached.doc, view.inputIdentity.documentId);
      } finally {
        cached.doc.destroy();
      }
    } catch {
      /* 保存副本独立于正文可读性；未能核对的副本保持待恢复。 */
    }
  });
  handle(
    "document-draft",
    (event, viewId: string, draft: { state: Uint8Array; sequence: number }) => {
      const view = context.views.get(viewId);
      if (!view || view.windowId !== BrowserWindow.fromWebContents(event.sender)?.id)
        throw new Error("文档副本的编辑视图已失效");
      context.contentState.saveDocumentDraft(view.inputIdentity, viewId, draft);
      try {
        const cached = context.store.load(view.inputIdentity.documentId);
        try {
          nodeUpdates.confirmDrafts(cached.doc, view.inputIdentity.documentId);
        } finally {
          cached.doc.destroy();
        }
      } catch {
        /* 未能核对的文档副本继续保留。 */
      }
    }
  );
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
  handle("update", async (event, id: string, update: Uint8Array, viewId?: string) => {
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
    if (session.doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION) {
      await nodeUpdates.apply(session, bytes, () => {
        const active = context.requireSession(id),
          currentView = viewId && context.views.get(viewId);
        if (
          active !== session ||
          (viewId &&
            (!currentView ||
              currentView.documentId !== session.info.id ||
              currentView.windowId !== BrowserWindow.fromWebContents(event.sender)?.id))
        )
          throw new Error("编辑视图已失效");
        if (
          session.info.status !== "active" ||
          (session.info.frozen && (!viewId || !session.drainingViews?.has(viewId)))
        )
          throw new Error("内容正在切换，请稍后重试");
      });
      context.changed(session);
      return;
    }
    throw new Error("旧格式正文只读，请先完成转换");
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
  });
  handle(
    "upload-resource",
    async (_event, id: string, file: { name: string; mime: string; bytes: Uint8Array }) => {
      const session = context.requireSession(id);
      // 视频不上传服务器，只在插入者本机可播放，其他成员看到占位
      if (session.info.mode === "local" || isVideoFile(file))
        return context.assets.keepLocalFile(session.info.id, file);
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
