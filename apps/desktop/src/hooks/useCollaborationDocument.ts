import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import {
  ASSET_PREFIX,
  readSharedContent,
  type SharedContent,
  type CollaborationSession,
} from "@tau/collaboration";
import type { EditorCollaborationBinding } from "@tau/editor/src/collaboration/types";
import { invoke, on, off } from "@/electron";
import { initializeCollaborationStore } from "@/stores/useCollaborationStore";
import { publishSessionValue } from "@/stores/useContentSessionStore";

const IPC_ORIGIN = Symbol("main-process");

export default function useCollaborationDocument(documentId?: string) {
  const [binding, setBinding] = useState<EditorCollaborationBinding>();
  const [article, setArticle] = useState<SharedContent>();
  const [error, setError] = useState<string>();
  const [frozen, setFrozen] = useState(false);
  useEffect(() => {
    initializeCollaborationStore();
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
    let activeBinding: EditorCollaborationBinding | undefined;
    const privateNodes = new Map<string, SharedContent["content"][number]>();
    // 私有块数据不经过 Y 文档，单独排队并在失败时重试，确保最终送达主进程。
    const pendingPrivateNodes = new Map<string, SharedContent["content"][number]>();
    const sendPrivateNodes = async (): Promise<void> => {
      for (const [collabId, node] of [...pendingPrivateNodes]) {
        await invoke("collaboration:private-node", id, viewId, collabId, node);
        pendingPrivateNodes.delete(collabId);
      }
    };
    const publish = () => {
      if (!disposed) {
        const value = readSharedContent(doc, privateNodes);
        setArticle(value);
        publishSessionValue(id, value);
      }
    };
    const sendUpdates = (): Promise<void> => {
      if (sending) return sending;
      sending = (async () => {
        while (pending.length) {
          const batch = pending;
          pending = [];
          try {
            await invoke("collaboration:update", id, Y.mergeUpdates(batch), viewId);
            if (!disposed) setError(undefined);
          } catch (failure) {
            pending.unshift(...batch);
            if (!disposed) setError(failure instanceof Error ? failure.message : "本地保存失败");
            throw failure;
          }
        }
      })().finally(() => {
        sending = undefined;
      });
      return sending;
    };
    const onFreeze = (_event: unknown, payload: { documentId: string; frozen: boolean }) => {
      if (payload.documentId !== id) return;
      if (!disposed) flushSync(() => setFrozen(payload.frozen));
      if (payload.frozen) {
        try {
          activeBinding?.flushLocal?.();
        } catch (failure) {
          if (!disposed) setError(failure instanceof Error ? failure.message : "本地保存失败");
          return;
        }
        void Promise.all([sendUpdates(), sendPrivateNodes()])
          .then(() => invoke("collaboration:freeze-ack", viewId))
          .catch(() => {});
      }
    };
    const onFlush = (event: unknown, payload: { documentId: string }) =>
      onFreeze(event, { ...payload, frozen: true });
    const onSessionError = (_event: unknown, payload: { documentId: string; error?: string }) => {
      if (payload.documentId === id && !disposed) setError(payload.error);
    };
    const onRemoved = (_event: unknown, payload: { documentId: string }) => {
      if (payload.documentId !== id) return;
      removed = true;
      // off 经 contextBridge 可能注销失败，documentId 切换后旧监听器仍会收到
      // removed 事件，若不守卫会清掉新订阅刚设置的 binding。
      if (disposed) return;
      disposed = true;
      setBinding(undefined);
      setArticle(undefined);
      setError(undefined);
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
    void invoke<{
      state: Uint8Array;
      awareness?: Uint8Array;
      privateNodes: [string, SharedContent["content"][number]][];
      session: CollaborationSession;
      user: { id: string; name: string; color: string };
    }>("collaboration:subscribe", id, viewId)
      .then(snapshot => {
        if (disposed) {
          void invoke("collaboration:unsubscribe", viewId).catch(() => {});
          return;
        }
        Y.applyUpdate(doc, new Uint8Array(snapshot.state), IPC_ORIGIN);
        for (const update of updates) Y.applyUpdate(doc, new Uint8Array(update), IPC_ORIGIN);
        for (const [collabId, node] of snapshot.privateNodes || [])
          privateNodes.set(collabId, node);
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
              void invoke(
                "collaboration:awareness",
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
          mode: snapshot.session.mode || "shared",
          role: snapshot.session.role,
          viewId,
          doc,
          awareness,
          origin: {},
          privateNodes,
          putPrivateNode: (collabId, node) => {
            pendingPrivateNodes.set(collabId, node);
            void sendPrivateNodes().catch(() => {});
          },
          uploadResource: async file =>
            invoke<string>("collaboration:upload-resource", id, {
              name: file.name,
              mime: file.type,
              bytes: new Uint8Array(await file.arrayBuffer()),
            }),
          resolveResource: async url =>
            url.startsWith(ASSET_PREFIX)
              ? invoke<string>("collaboration:resource", id, url.slice(ASSET_PREFIX.length))
              : url,
        };
        setBinding(activeBinding);
        publish();
      })
      .catch(failure => {
        if (!disposed) setError(failure instanceof Error ? failure.message : "协作文章加载失败");
      });
    const retry = setInterval(() => {
      if (pending.length) void sendUpdates().catch(() => {});
      if (pendingPrivateNodes.size) void sendPrivateNodes().catch(() => {});
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
          !removed ? sendPrivateNodes() : Promise.resolve(),
        ])
          .then(() => invoke("collaboration:unsubscribe", viewId))
          .then(release)
          .catch(() => {
            if (attempts < 30) setTimeout(finish, 1000);
            else release();
          });
      };
      finish();
    };
  }, [documentId]);
  return {
    binding: binding?.doc.guid === documentId ? binding : undefined,
    article,
    error,
    frozen,
  };
}
