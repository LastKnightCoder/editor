import { RefObject, useEffect, useMemo, useRef } from "react";
import { Descendant } from "slate";
import type { EditorRef } from "@tau/editor/src";
import {
  createActiveEditingSessionId,
  removeActiveEditingSession,
  setActiveEditingSessionFocus,
  updateActiveEditingSessionContent,
  updateActiveEditingSessionSelection,
  upsertActiveEditingSession,
} from "@/services/content-editing";
import type { EntityType } from "@/services/content-editing";
import type { TabType } from "@/types/tab";

/** 编辑会话的宿主定位——legacy 多 tab 语境由调用方传自己的 tab 信息；
 *  无 tab 语境（新壳层页面）省略，会话的可选定位字段为空 */
export interface ActiveEditingHost {
  tabId?: string;
  paneId?: string;
  tabType?: TabType;
}

interface UseRegisterActiveEditingContextOptions {
  contentId?: number;
  entityType: EntityType;
  entityId?: number;
  editorRef: RefObject<EditorRef | null>;
  content: Descendant[] | undefined;
  host?: ActiveEditingHost;
}

const useRegisterActiveEditingContext = (options: UseRegisterActiveEditingContextOptions) => {
  const { contentId, entityType, entityId, editorRef, content, host } = options;
  const sessionIdRef = useRef<string>(createActiveEditingSessionId());

  const canRegister = useMemo(() => {
    return Boolean(contentId && entityId);
  }, [contentId, entityId]);

  useEffect(() => {
    if (!canRegister || !contentId || !entityId) {
      return;
    }
    upsertActiveEditingSession({
      sessionId: sessionIdRef.current,
      contentId,
      entityType,
      entityId,
      tabId: host?.tabId,
      paneId: host?.paneId,
      tabType: host?.tabType,
      content: content || [],
    });
    return () => {
      removeActiveEditingSession(sessionIdRef.current);
    };
  }, [canRegister, contentId, entityType, entityId, host?.tabId, host?.tabType, host?.paneId]);

  useEffect(() => {
    if (!canRegister || !content) return;
    updateActiveEditingSessionContent(sessionIdRef.current, content);
  }, [canRegister, content]);

  const handleSelectionChange = () => {
    if (!canRegister) return;
    const editor = editorRef.current?.getEditor();
    if (!editor) return;
    updateActiveEditingSessionSelection(sessionIdRef.current, editor.selection);
  };

  const handleFocus = () => {
    if (!canRegister) return;
    setActiveEditingSessionFocus(sessionIdRef.current, true);
    const editor = editorRef.current?.getEditor();
    if (!editor) return;
    updateActiveEditingSessionSelection(sessionIdRef.current, editor.selection);
  };

  const handleBlur = () => {
    if (!canRegister) return;
    setActiveEditingSessionFocus(sessionIdRef.current, false);
  };

  return {
    handleSelectionChange,
    handleFocus,
    handleBlur,
  };
};

export default useRegisterActiveEditingContext;
