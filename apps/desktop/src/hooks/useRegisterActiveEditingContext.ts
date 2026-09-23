import { RefObject, useEffect, useMemo, useRef } from "react";
import { Descendant } from "slate";
import type { EditorRef } from "@tau/editor/src";
import { useOptionalTabContext } from "@/contexts/TabContext";
import {
  createActiveEditingSessionId,
  removeActiveEditingSession,
  setActiveEditingSessionFocus,
  updateActiveEditingSessionContent,
  updateActiveEditingSessionSelection,
  upsertActiveEditingSession,
} from "@/services/content-editing";
import type { EntityType } from "@/services/content-editing";

interface UseRegisterActiveEditingContextOptions {
  contentId?: number;
  entityType: EntityType;
  entityId?: number;
  editorRef: RefObject<EditorRef | null>;
  content: Descendant[] | undefined;
}

const useRegisterActiveEditingContext = (options: UseRegisterActiveEditingContextOptions) => {
  const { contentId, entityType, entityId, editorRef, content } = options;
  /* 新壳层页面无 legacy tab Provider：降级为稳定假值（会话注册/光标追踪照常，
     tab 定位能力仅 legacy 多 tab 语境有效） */
  const tabContext = useOptionalTabContext();
  const tab = tabContext?.tab;
  const paneId = tabContext?.paneId ?? "shell";
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
      tabId: tab?.id ?? "shell-page",
      paneId,
      tabType: tab?.type,
      content: content || [],
    });
    return () => {
      removeActiveEditingSession(sessionIdRef.current);
    };
  }, [canRegister, contentId, entityType, entityId, tab?.id, tab?.type, paneId]);

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
