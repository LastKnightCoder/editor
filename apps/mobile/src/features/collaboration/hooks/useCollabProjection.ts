// owner 侧投影 hook（设计稿 §5.4）：本机发起共享的内容，把云端 Y.Doc 状态节流
// 投影回本地库，保持本地与云端一致。走 collabProjectContent 专用通道（带绑定漂移
// 校验），常规 update_content 已被数据库层守卫拒绝直写协作内容。
// 协作编辑页与详情页原地协作编辑共用。
import { useEffect, useRef } from "react";
import type { Descendant } from "slate";
import { readSharedContent } from "@tau/collaboration/src/document";
import type { EditorCollaborationBinding } from "@tau/editor-collab";
import { toast } from "../../../components/toast";
import * as tauri from "../../../services/tauri";
import { getContentLength } from "../../cards/editorContentUtils";

/** 投影节流间隔：比桌面端 1s 放宽，减少移动端写放大 */
const PROJECT_INTERVAL_MS = 2000;

/** 物化结果中是否仍含协作占位符：owner 侧出现即私有块真身缺失（云端只有占位符），
 *  此时严禁投影写回——否则本机真身会被占位符覆盖（对齐桌面端回填失败阻止投影） */
function containsPlaceholder(nodes: unknown[]): boolean {
  return nodes.some(node => {
    if (!node || typeof node !== "object") return false;
    const entry = node as { type?: string; children?: unknown[] };
    if (entry.type === "collaboration-placeholder") return true;
    return Array.isArray(entry.children) ? containsPlaceholder(entry.children) : false;
  });
}

export function useCollabProjection(
  binding: EditorCollaborationBinding | undefined,
  boundContentId: number | undefined,
  /** 暂停投影（重连后有本地兜底改动待作者选择时）：绝不能拿云端内容覆盖本地待决改动，
   *  因此暂停期间的收尾投影也要抑制 */
  paused = false
) {
  // 收尾投影（effect cleanup）读的是切换那一刻的最新值：暂停时必须连收尾一起跳过
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (!binding || !boundContentId || paused) return;
    let lastSnapshot = "";
    let projecting = false;
    let dirty = false;
    let driftNotified = false;
    let placeholderNotified = false;
    const project = () => {
      if (projecting) {
        // 上一次投影仍在途：置脏等它完成后补投，避免慢调用乱序完成旧覆新
        dirty = true;
        return;
      }
      try {
        const shared = readSharedContent(binding.doc, binding.privateNodes);
        const content = shared.content as Descendant[];
        const snapshot = JSON.stringify(content);
        if (snapshot === lastSnapshot) return;
        if (containsPlaceholder(content)) {
          // 私有块真身缺失（会话重建后回填未完成/失败）：跳过本轮且不记账，
          // 留待真身恢复后再投影，绝不拿占位符覆盖本地
          if (!placeholderNotified) {
            placeholderNotified = true;
            toast.warning("部分私有块未能从本机恢复，已暂停同步到本地");
          }
          return;
        }
        lastSnapshot = snapshot;
        projecting = true;
        void tauri
          .collabProjectContent({
            contentId: boundContentId,
            content,
            count: getContentLength(content),
          })
          .then(result => {
            // 本地内容已被删除重建：服务端侧自动解绑，提示一次即可
            if (result.reason === "drift" && !driftNotified) {
              driftNotified = true;
              toast.warning("本地内容已变化，已停止协作投影");
            }
          })
          .catch(() => {
            // 失败回滚快照记账，下一轮重新投影（否则该版本会静默滞留在本地）
            lastSnapshot = "";
          })
          .finally(() => {
            projecting = false;
            if (dirty) {
              dirty = false;
              project();
            }
          });
      } catch {
        // Y.Doc 尚未就绪时跳过本轮
      }
    };
    const timer = setInterval(project, PROJECT_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      // 暂停态下不得收尾投影：云端内容会覆盖等待作者裁决的本地改动
      if (!pausedRef.current) project();
    };
  }, [binding, boundContentId, paused]);
}
