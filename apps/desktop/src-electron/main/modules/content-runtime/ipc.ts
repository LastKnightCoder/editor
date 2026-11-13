import { readDocumentIdentity } from "@tau/collaboration";
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { localContentCommands } from "@/commands/contracts/collaboration";
import * as Y from "yjs";
import { applyAwarenessUpdate } from "y-protocols/awareness";
import {
  memberColor,
  NODE_DOCUMENT_VERSION,
  NodeTree,
  createNodeDocument,
  collectNodeDocumentResources,
  isSafeResource,
  ASSET_PREFIX,
  LOCAL_ASSET_PREFIX,
  type ContentNode,
  type ContentInputDraft,
  type ContentSessionTarget,
} from "@tau/collaboration";
import type { CollaborationIpcContext } from "../collaboration/types";
import { validateContentContractsSync } from "@tau/db-schema/content-contracts-node";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { isVideoFile } from "../collaboration/asset-service";
import { saveSourceInput } from "./recovery";
import type { CollaborationImageFile } from "../../../../shared/collaboration-image-storage";

type Commands = typeof localContentCommands;
export type ContentIpcContext = Pick<
  CollaborationIpcContext,
  | "nodeUpdates"
  | "store"
  | "contentState"
  | "assets"
  | "views"
  | "openContent"
  | "findSession"
  | "requireSession"
  | "databaseForEvent"
  | "changed"
  | "removeView"
  | "acknowledgeFreeze"
  | "presenceSnapshot"
> & {
  user(): { id: string; nickname: string };
  flushResources?(): Promise<void>;
};
type CommandHandler<Key extends keyof Commands> = (
  event: IpcMainInvokeEvent,
  ...args: Parameters<Commands[Key]["call"]>
) => Awaited<ReturnType<Commands[Key]["call"]>> | ReturnType<Commands[Key]["call"]>;

export function registerContentIpc(context: ContentIpcContext, commands: Commands) {
  const { nodeUpdates } = context;
  const handle = <Key extends keyof Commands>(key: Key, fn: NoInfer<CommandHandler<Key>>) =>
    ipcMain.handle(commands[key].channel, fn);
  handle(
    "prepareFragment",
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
        contracts,
        { allowLocalResources: true }
      );
      const references = collectNodeDocumentResources(candidate).filter(
        reference =>
          reference.startsWith(ASSET_PREFIX) ||
          reference.startsWith(LOCAL_ASSET_PREFIX) ||
          (!isSafeResource(reference) && !reference.startsWith("data:"))
      );
      candidate.destroy();
      if (!references.length && target.info.mode === "local") return content;
      const source = context.findSession(sourceId);
      if (references.length) {
        if (!source) throw new Error("附件的原文档尚未打开，请打开后重新复制");
        const allowed = new Set(collectNodeDocumentResources(source.doc));
        if (references.some(reference => !allowed.has(reference)))
          throw new Error("附件不属于复制来源，不能读取");
      }
      const localized = source
        ? await (source.assets ?? context.assets).localizeDocument(
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
  handle("openContent", (event, target: ContentSessionTarget) =>
    context.openContent(event, target)
  );
  handle("freezeAck", (event, viewId: string, requestId?: string) => {
    const view = context.views.get(viewId);
    if (view?.windowId === BrowserWindow.fromWebContents(event.sender)?.id)
      context.acknowledgeFreeze(viewId, requestId);
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
    const { documentId, baselineId, epoch } = readDocumentIdentity(session.doc);
    context.views.set(viewId, {
      // 视图绑定当前会话身份，换源后由渲染端重新订阅。
      documentId: session.info.id,
      windowId: window.id,
      clientIds: [],
      inputIdentity: {
        workspaceId,
        documentId: session.info.id,
        baselineId,
        epoch,
      },
    });
    const user = context.user();
    const deviceId = user.id;
    const nodeViews: Record<string, Record<string, unknown>> = {};
    const rows = context.contentState.db
      .prepare("SELECT node_id,value FROM node_views WHERE workspace_id=? AND document_id=?")
      .all(workspaceId, session.info.source?.contentDocumentId ?? session.info.id) as {
      node_id: string;
      value: string;
    }[];
    for (const row of rows) {
      try {
        nodeViews[row.node_id] = JSON.parse(row.value);
      } catch {
        console.warn("[content] 已跳过不可读取的节点视图状态");
      }
    }
    return {
      documentIdentity: { documentId, baselineId, epoch },
      nodeViews,
      state: Y.encodeStateAsUpdate(session.doc),
      awareness: context.presenceSnapshot(session),
      session: session.info,
      user: {
        id: deviceId,
        name: user.nickname,
        color: memberColor(deviceId),
      },
    };
  });
  handle(
    "updateNodeView",
    (event, viewId: string, nodeId: string, patch: Record<string, unknown>) => {
      const view = context.views.get(viewId);
      if (!view || view.windowId !== BrowserWindow.fromWebContents(event.sender)?.id)
        throw new Error("编辑视图已失效");
      const session = context.requireSession(view.documentId);
      if (session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION)
        throw new Error("正文格式不受支持");
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
    }
  );
  handle("inputDraft", (event, viewId: string, draft: ContentInputDraft) => {
    const view = context.views.get(viewId);
    if (!view || view.windowId !== BrowserWindow.fromWebContents(event.sender)?.id)
      throw new Error("输入副本的编辑视图已失效");
    const session = context.requireSession(view.documentId);
    if (session.info.mode === "local")
      saveSourceInput(context.store, context.contentState, view.inputIdentity, viewId, draft);
    else context.contentState.saveInputDraft(view.inputIdentity, viewId, draft);
    try {
      const cached = context.store.load(view.inputIdentity.documentId);
      try {
        nodeUpdates.confirmDrafts(cached.doc, view.inputIdentity.documentId);
      } finally {
        cached.doc.destroy();
      }
    } catch {
      /* 未确认输入独立保存，只有匹配的耐久正文回执可以清除。 */
    }
  });
  handle(
    "documentDraft",
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
  handle("unsubscribe", (event, viewId: string) => {
    const view = context.views.get(viewId);
    if (view?.windowId === BrowserWindow.fromWebContents(event.sender)?.id)
      context.removeView(viewId);
  });
  handle("update", async (event, id: string, update: Uint8Array, viewId?: string) => {
    const session = context.requireSession(id);
    const view = viewId && context.views.get(viewId);
    if (
      (session.info.mode === "local" && !viewId) ||
      (viewId &&
        (!view ||
          view.documentId !== session.info.id ||
          view.windowId !== BrowserWindow.fromWebContents(event.sender)?.id))
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
    throw new Error("正文格式不受支持，禁止写入");
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
  const resourceView = (event: IpcMainInvokeEvent, viewId: string) => {
    const view = context.views.get(viewId);
    if (!view || view.windowId !== BrowserWindow.fromWebContents(event.sender)?.id)
      throw new Error("资源上传视图已失效");
    const session = context.requireSession(view.documentId);
    const check = () => {
      if (
        context.views.get(viewId) !== view ||
        context.findSession(view.documentId) !== session ||
        session.info.frozen ||
        session.info.leaving ||
        session.info.status !== "active"
      )
        throw new Error("资源上传会话已变化");
    };
    check();
    return { session, check };
  };
  handle("uploadSharedResource", async (event, viewId: string, file: CollaborationImageFile) => {
    const { session, check } = resourceView(event, viewId);
    if (!(file.bytes instanceof Uint8Array)) throw new Error("文件数据无效");
    if (session.info.mode === "local" || (session.info.role !== "editor" && !isVideoFile(file)))
      throw new Error("作者图片必须使用自己的存储配置");
    if (!isVideoFile(file) && file.bytes.byteLength > 25 * 1024 * 1024)
      throw new Error("文件超过 25 MB");
    const reference = isVideoFile(file)
      ? await context.assets.keepLocalFile(session.info.id, file)
      : await context.assets.enqueue(session.info.id, file);
    check();
    if (context.assets.hasPending(session.info.id)) {
      session.provider?.detach();
      session.info.pending = true;
      context.changed(session);
      void context.flushResources?.();
    }
    return reference;
  });
  handle("prepareResource", async (event, viewId: string, reference: string) => {
    const { session, check } = resourceView(event, viewId);
    if (typeof reference !== "string" || !reference) throw new Error("上传未返回资源地址");
    if (session.info.mode === "local") return reference;
    if (session.info.role !== "owner") throw new Error("成员图片必须先上传到协作服务器");
    const prepared = await context.assets.shareReference(
      session.info.serverUrl,
      session.info.id,
      reference,
      "",
      true
    );
    check();
    if (context.assets.hasPending(session.info.id)) {
      session.provider?.detach();
      session.info.pending = true;
      context.changed(session);
      void context.flushResources?.();
    }
    return prepared;
  });
  handle("resolveResource", (_event, id: string, reference: string) => {
    const session = context.requireSession(id);
    return context.assets.resolveReference(session.info.serverUrl, session.info.id, reference);
  });
}
export function registerLocalContentIpc(context: ContentIpcContext) {
  registerContentIpc(context, localContentCommands);
}
