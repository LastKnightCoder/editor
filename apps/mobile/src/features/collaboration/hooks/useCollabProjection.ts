import { useEffect, useRef } from "react";
import type { ContentCollaborationBinding } from "@tau/editor-collab";
import { NODE_DOCUMENT_VERSION } from "@tau/collaboration";
import { collaborationManager } from "../core/manager";
import { toast } from "../../../components/toast";

/** 投影由持有缓存及观察修订的会话提交，视图只负责触发。 */
export function useCollabProjection(
  binding: ContentCollaborationBinding | undefined,
  boundContentId: number | undefined,
  paused = false
) {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    if (
      !binding ||
      !boundContentId ||
      paused ||
      binding.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION
    )
      return;
    let notified = false;
    const project = () => {
      if (pausedRef.current) return;
      void collaborationManager.project(binding.doc.guid).catch(failure => {
        if (!notified) {
          notified = true;
          toast.warning(
            failure instanceof Error ? failure.message : "正文投影失败，原协作缓存已保留"
          );
        }
      });
    };
    const timer = setInterval(project, 2000);
    return () => {
      clearInterval(timer);
      project();
    };
  }, [binding, boundContentId, paused]);
}
