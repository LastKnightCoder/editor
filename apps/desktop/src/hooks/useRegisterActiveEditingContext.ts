import { RefObject, useEffect, useMemo, useRef } from "react";
import { Descendant } from "slate";
import type { EditorRef } from "@tau/editor/src";
import { useTabContext } from "@/contexts/TabContext";
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

const useRegisterActiveEditingContext = (
  options: UseRegisterActiveEditingContextOptions,
) => {
  const { contentId, entityType, entityId, editorRef, content } = options;
  const { tab, paneId } = useTabContext();
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
      tabId: tab.id,
      paneId,
      tabType: tab.type,
      content: content || [],
    });
    return () => {
      removeActiveEditingSession(sessionIdRef.current);
    };
  }, [canRegister, contentId, entityType, entityId, tab.id, tab.type, paneId]);

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
