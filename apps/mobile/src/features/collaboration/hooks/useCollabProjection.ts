import { useEffect, useRef } from "react";
import type { ContentCollaborationBinding } from "@tau/editor-collab";
import { NODE_DOCUMENT_VERSION } from "@tau/collaboration";
import { collaborationManager } from "../core/manager";
import { toast } from "../../../components/toast";
import { roomFailureText } from "../room.i18n";

/** 投影由持有缓存及观察修订的会话提交，视图只负责触发。 */
export function useCollabProjection(
  binding: Pick<ContentCollaborationBinding, "doc"> | undefined,
  boundContentId: number | undefined,
  options: { guard?: () => void; canWrite?: () => boolean; project?: () => Promise<void> } = {}
) {
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    if (
      !binding ||
      !boundContentId ||
      binding.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION
    )
      return;
    let notified = false;
    const project = () => {
      try {
        latest.current.guard?.();
        if (latest.current.canWrite?.() === false) return;
      } catch {
        return;
      }
      void (latest.current.project?.() ?? collaborationManager.project(binding.doc.guid)).catch(
        failure => {
          if (!notified) {
            notified = true;
            toast.warning(roomFailureText(failure, "projection.failed"));
          }
        }
      );
    };
    const timer = setInterval(project, 2000);
    return () => {
      clearInterval(timer);
      project();
    };
  }, [binding, boundContentId]);
}
