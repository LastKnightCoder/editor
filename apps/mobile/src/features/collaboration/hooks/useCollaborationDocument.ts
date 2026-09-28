// 视图侧协作绑定：把运行时会话（Y.Doc / Awareness）包装成 @tau/editor 的
// EditorCollaborationBinding。移动端视图与会话同进程，直接复用同一 Y.Doc，
// 不存在桌面端的副本与 IPC 同步。
import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorCollaborationBinding } from "@tau/editor-collab";
import { ASSET_PREFIX } from "@tau/collaboration/src/protocol";
import * as tauri from "../../../services/tauri";
import { collaborationManager } from "../core/manager";
import { useCollaborationStore } from "../core/store";

/** 本地写入与远端更新共用同一个 origin 对象即可，editor 层据此区分投影写入 */
const LOCAL_ORIGIN = { collaboration: "mobile-local" };

function describe(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "协作文档加载失败";
}

export default function useCollaborationDocument(documentId?: string) {
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [boundContentId, setBoundContentId] = useState<number>();
  // 重试计数：会话建立失败后由宿主「重试连接」递增，重跑下方补建 effect
  const [reloadRev, setReloadRev] = useState(0);
  const session = useCollaborationStore(state =>
    documentId ? state.sessions.find(item => item.id === documentId) : undefined
  );
  const runtime = collaborationManager.session(documentId);

  // 曾就绪的会话消失＝共享已结束/已退出/被撤权（作者主动结束时属正常路径，不是连接失败）。
  // 用 ref 记录单调事实，避免会话消失的那一帧把「已结束」误判成「连不上」而弹重试。
  const everReadyRef = useRef(false);
  if (session) everReadyRef.current = true;
  const ended = !session && everReadyRef.current;

  // 反查本地绑定：仅当该房间由本机发起时才需要把云端内容投影回本地库
  useEffect(() => {
    if (!documentId) {
      setBoundContentId(undefined);
      return;
    }
    let disposed = false;
    void tauri
      .collabListBindings()
      .then(bindings => {
        const match = bindings.find(item => item.documentId === documentId);
        if (!disposed && match) setBoundContentId(match.contentId);
      })
      .catch(() => {
        // 绑定表读取失败不影响协作编辑，仅跳过投影
      });
    return () => {
      disposed = true;
    };
  }, [documentId]);

  // 列表刷新尚未覆盖（如刚被批准）或深链直接进入时，就地补建会话。
  // 已结束的会话不再补建：文档在服务端已关闭，重开只会得到错误
  useEffect(() => {
    if (!documentId || ended || collaborationManager.session(documentId)) return;
    let disposed = false;
    setLoading(true);
    setError(undefined);
    void collaborationManager
      .openDocument(documentId)
      .catch(failure => {
        if (!disposed) setError(describe(failure));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [documentId, runtime, reloadRev, ended]);

  const binding = useMemo<EditorCollaborationBinding | undefined>(() => {
    if (!runtime) return undefined;
    return {
      mode: "shared",
      role: runtime.info.role,
      doc: runtime.doc,
      awareness: runtime.awareness,
      origin: LOCAL_ORIGIN,
      privateNodes: runtime.privateNodes,
      putPrivateNode: (collabId, node) => {
        runtime.privateNodes.set(collabId, node);
      },
      // 附件上传/下载为 P2 范围：此前移动端仅消费远端资源，遇到协作附件给出明确提示
      uploadResource: async () => {
        throw new Error("COLLAB_ASSET_UNSUPPORTED: 移动端暂不支持上传协作附件");
      },
      resolveResource: async url => {
        if (url.startsWith(ASSET_PREFIX)) {
          throw new Error("COLLAB_ASSET_UNSUPPORTED: 移动端暂不支持协作附件");
        }
        return url;
      },
    };
  }, [runtime]);

  return {
    binding,
    session,
    loading,
    error,
    /** 该房间对应的本地内容 id（由本机发起时才存在），投影回写的目标 */
    boundContentId,
    frozen: Boolean(session?.frozen) || Boolean(session?.leaving),
    /** 曾就绪的会话已消失：共享被结束/退出/撤权（正常业务路径，不应提示重试） */
    ended,
    /** 会话建立失败或已有会话断线后的重试 */
    retry: () => {
      if (documentId && (session?.connection === "offline" || session?.connection === "error")) {
        void collaborationManager.reconnect(documentId);
        return;
      }
      setReloadRev(value => value + 1);
    },
  };
}
