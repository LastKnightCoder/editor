import { useEffect, useState } from "react";
import {
  ackCollaborationFreeze,
  resolveCollaborationResource,
  sendCollaborationAwareness,
  preserveCollaborationInputDraft,
  preserveCollaborationDocumentDraft,
  subscribeCollaborationDocument,
  unsubscribeCollaborationDocument,
  updateCollaborationDocument,
  uploadCollaborationResource,
} from "@/commands";
import { flushSync } from "react-dom";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import {
  isCollaborationResource,
  readSharedContent,
  readNodeDocument,
  NODE_DOCUMENT_VERSION,
  validateNodeDocument,
  type SharedContent,
  type ContentInputDraft,
} from "@tau/collaboration";
import type { ContentCollaborationBinding } from "@tau/editor-collab";
import { on, off } from "@/electron";
import { collaborationCommands } from "@/commands/contracts/collaboration";

const IPC_ORIGIN = Symbol("main-process");

export default function useCollaborationDocument(documentId?: string) {
  const [binding, setBinding] = useState<ContentCollaborationBinding>();
  const [article, setArticle] = useState<SharedContent>();
  const [error, setError] = useState<string>();
  const [frozen, setFrozen] = useState(false);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    setBinding(undefined);
    setArticle(undefined);
    setError(undefined);
    setFrozen(false);
    if (!documentId) return;
    const id = documentId;
    const viewId = crypto.randomUUID();
    const doc = new Y.Doc({ guid: id });
    const awareness = new Awareness(doc);
    const updates: Uint8Array[] = [];
    const states: Uint8Array[] = [];
    let ready = false;
    let disposed = false;
    let removed = false;
    let pending: Uint8Array[] = [];
    let sending: Promise<void> | undefined;
    let activeBinding: ContentCollaborationBinding | undefined;
    // 私有块数据不经过 Y 文档，单独排队并在失败时重试，确保最终送达主进程。
    const pendingDrafts = new Map<string, ContentInputDraft>();
    let draftSequence = 0;
    let documentDraftSequence = 0;
    const preserveDocument = () =>
      preserveCollaborationDocumentDraft(viewId, {
        state: Y.encodeStateAsUpdate(doc),
        sequence: ++documentDraftSequence,
      });
    let sendingDrafts: Promise<void> | undefined;
    const sendDrafts = (): Promise<void> => {
      if (sendingDrafts) return sendingDrafts;
      sendingDrafts = (async () => {
        while (pendingDrafts.size) {
          for (const [key, draft] of [...pendingDrafts]) {
            await preserveCollaborationInputDraft(viewId, draft);
            if (pendingDrafts.get(key) === draft) pendingDrafts.delete(key);
          }
        }
      })()
        .catch(failure => {
          if (!disposed) setError(failure instanceof Error ? failure.message : "输入副本尚未保存");
          throw failure;
        })
        .finally(() => {
          sendingDrafts = undefined;
        });
      return sendingDrafts;
    };
    const publish = () => {
      if (!disposed) {
        const value =
          doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION
            ? readNodeDocument(doc)
            : readSharedContent(doc);
        setArticle(value);
      }
    };
    const sendUpdates = (): Promise<void> => {
      if (sending) return sending;
      sending = (async () => {
        while (pending.length) {
          const batch = pending;
          pending = [];
          try {
            await updateCollaborationDocument(id, Y.mergeUpdates(batch), viewId);
            if (!disposed) setError(undefined);
          } catch (failure) {
            pending.unshift(...batch);
            await preserveDocument();
            if (!disposed) setError(failure instanceof Error ? failure.message : "本地保存失败");
            throw failure;
          }
        }
      })().finally(() => {
        sending = undefined;
      });
      return sending;
    };
    const onFreeze = (
      _event: unknown,
      payload: { documentId: string; frozen: boolean; requestId?: string }
    ) => {
      if (payload.documentId !== id) return;
      if (payload.frozen) {
        try {
          activeBinding?.flushLocal?.();
        } catch (failure) {
          if (!disposed) setError(failure instanceof Error ? failure.message : "本地保存失败");
          return;
        }
        if (!disposed) flushSync(() => setFrozen(true));
        void Promise.all([sendUpdates(), sendDrafts()])
          .catch(async () => {
            await Promise.all([preserveDocument(), sendDrafts()]);
          })
          .then(() => ackCollaborationFreeze(viewId, payload.requestId))
          .catch(() => {});
      } else if (!disposed) flushSync(() => setFrozen(false));
    };
    const onFlush = (event: unknown, payload: { documentId: string }) =>
      onFreeze(event, { ...payload, frozen: true });
    const onSessionError = (_event: unknown, payload: { documentId: string; error?: string }) => {
      if (payload.documentId === id && !disposed) setError(payload.error);
    };
    const onRemoved = (_event: unknown, payload: { documentId: string; replaced?: boolean }) => {
      if (payload.documentId !== id) return;
      removed = true;
      // off 经 contextBridge 可能注销失败，documentId 切换后旧监听器仍会收到
      // removed 事件，若不守卫会清掉新订阅刚设置的 binding。
      if (disposed) return;
      disposed = true;
      setBinding(undefined);
      setArticle(undefined);
      setError(undefined);
      if (payload.replaced) setGeneration(value => value + 1);
    };
    const onUpdate = (_event: unknown, payload: { documentId: string; update: Uint8Array }) => {
      if (payload.documentId !== id) return;
      if (!ready) updates.push(payload.update);
      else Y.applyUpdate(doc, new Uint8Array(payload.update), IPC_ORIGIN);
    };
    const onAwareness = (_event: unknown, payload: { documentId: string; update: Uint8Array }) => {
      if (payload.documentId !== id) return;
      if (!ready) states.push(payload.update);
      else applyAwarenessUpdate(awareness, new Uint8Array(payload.update), IPC_ORIGIN);
    };
    on("collaboration:update", onUpdate);
    on("collaboration:awareness", onAwareness);
    on("collaboration:freeze", onFreeze);
    on("collaboration:flush", onFlush);
    on("collaboration:session-error", onSessionError);
    on("collaboration:removed", onRemoved);
    void subscribeCollaborationDocument(id, viewId)
      .then(async snapshot => {
        if (disposed) {
          void unsubscribeCollaborationDocument(viewId).catch(() => {});
          return;
        }
        Y.applyUpdate(doc, new Uint8Array(snapshot.state), IPC_ORIGIN);
        for (const update of updates) Y.applyUpdate(doc, new Uint8Array(update), IPC_ORIGIN);
        updates.length = 0;
        if (doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION) {
          await validateNodeDocument(doc, {
            documentId: id,
            baselineId: String(doc.getMap("meta").get("baselineId")),
            epoch: Number(doc.getMap("meta").get("epoch")),
          });
          if (disposed) return;
          for (const update of updates) Y.applyUpdate(doc, new Uint8Array(update), IPC_ORIGIN);
          updates.length = 0;
        }
        if (snapshot.awareness)
          applyAwarenessUpdate(awareness, new Uint8Array(snapshot.awareness), IPC_ORIGIN);
        for (const state of states)
          applyAwarenessUpdate(awareness, new Uint8Array(state), IPC_ORIGIN);
        ready = true;
        doc.on("update", (update: Uint8Array, origin: unknown) => {
          publish();
          if (origin !== IPC_ORIGIN) {
            pending.push(update);
            void sendUpdates().catch(() => {});
          }
        });
        awareness.on(
          "update",
          (
            { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
            origin: unknown
          ) => {
            if (origin !== IPC_ORIGIN)
              void sendCollaborationAwareness(
                id,
                viewId,
                encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed]),
                doc.clientID
              ).catch(() => {});
          }
        );
        awareness.setLocalStateField("activity", "viewing");
        awareness.setLocalStateField("user", {
          ...snapshot.user,
          viewId,
        });
        setFrozen(Boolean(snapshot.session.frozen));
        activeBinding = {
          prepareFragment: (sourceId, content, contracts) =>
            collaborationCommands.prepareFragment.call(viewId, sourceId, content, contracts),
          nodeViews: {
            read: nodeId => snapshot.nodeViews?.[nodeId],
            write: async (nodeId, patch) => {
              await sendUpdates();
              return collaborationCommands.updateNodeView.call(viewId, nodeId, patch);
            },
          },
          mode: snapshot.session.mode || "shared",
          role: snapshot.session.role,
          viewId,
          doc,
          awareness,
          origin: {},
          preserveInputDraft: (nodeId, field, draft) => {
            pendingDrafts.set(JSON.stringify([nodeId, field]), {
              ...draft,
              nodeId,
              field,
              sequence: ++draftSequence,
            });
            void sendDrafts().catch(() => {});
          },
          uploadResource: async file =>
            uploadCollaborationResource(id, {
              name: file.name,
              mime: file.type,
              bytes: new Uint8Array(await file.arrayBuffer()),
            }),
          resolveResource: async url =>
            isCollaborationResource(url) ? resolveCollaborationResource(id, url) : url,
        };
        setBinding(activeBinding);
        publish();
      })
      .catch(failure => {
        if (!disposed) setError(failure instanceof Error ? failure.message : "协作文章加载失败");
      });
    const retry = setInterval(() => {
      if (pending.length) void sendUpdates().catch(() => {});
      if (pendingDrafts.size) void sendDrafts().catch(() => {});
    }, 1000);
    return () => {
      try {
        activeBinding?.flushLocal?.();
      } catch {
        // 后续重试仍会发送已经进入 Y 文档的更新。
      }
      disposed = true;
      clearInterval(retry);
      off("collaboration:update", onUpdate);
      off("collaboration:awareness", onAwareness);
      off("collaboration:session-error", onSessionError);
      off("collaboration:removed", onRemoved);
      awareness.setLocalState(null);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        off("collaboration:freeze", onFreeze);
        off("collaboration:flush", onFlush);
        awareness.destroy();
        doc.destroy();
      };
      // 保存与注销完成前继续响应窗口冻结，避免卸载中的视图阻塞结束共享或退出。
      let attempts = 0;
      const finish = () => {
        attempts += 1;
        void Promise.all([
          !removed && pending.length ? sendUpdates() : Promise.resolve(),
          sendDrafts(),
        ])
          .catch(async () => {
            await Promise.all([preserveDocument(), sendDrafts()]);
          })
          .then(() => unsubscribeCollaborationDocument(viewId))
          .then(release)
          .catch(() => {
            setTimeout(finish, Math.min(30_000, attempts * 1000));
          });
      };
      finish();
    };
  }, [documentId, generation]);
  return {
    binding: binding?.doc.guid === documentId ? binding : undefined,
    article,
    error,
    frozen:
      frozen ||
      Boolean(binding && binding.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION),
  };
}
