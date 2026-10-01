import { useEffect, useRef, useState } from "react";
import { Descendant } from "slate";
import { updateContent, getContentById } from "@/commands";
import { useMemoizedFn, useCreation, useThrottleFn } from "ahooks";
import { defaultContentEventBus, ContentEventData } from "@/utils";
import useSettingStore from "@/stores/useSettingStore";
import useContentSessionStore, { contentSessionKey } from "@/stores/useContentSessionStore";

const createDefaultContent = (): Descendant[] => [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const useEditContent = (
  contentId: number | undefined,
  /** 可选的内容快照通知，用于宿主的字数或业务状态同步。 */
  onContentChange?: (content: Descendant[]) => void,
  enabled = true
) => {
  const databaseName = useSettingStore(state => state.setting.database.active);
  const sessionKey = contentSessionKey(databaseName, contentId || 0);
  const session = useContentSessionStore(state => state.entries[sessionKey]);
  const contentEditor = useCreation(() => defaultContentEventBus.createEditor(), []);
  const [content, setContent] = useState<Descendant[]>(createDefaultContent);
  const onContentChangeRef = useRef(onContentChange);

  useEffect(() => {
    onContentChangeRef.current = onContentChange;
  }, [onContentChange]);

  useEffect(() => {
    if (!enabled || !session?.value) return;
    const value = session.value.content as Descendant[];
    setContent(value);
    onContentChangeRef.current?.(value);
  }, [session?.value, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    if (!contentId) {
      const nextContent = createDefaultContent();
      setContent(nextContent);
      onContentChangeRef.current?.(nextContent);
    }
    if (contentId) {
      getContentById(contentId).then(content => {
        if (!active || useContentSessionStore.getState().entries[sessionKey]?.value) return;
        const nextContent = content?.content || createDefaultContent();
        setContent(nextContent);
        onContentChangeRef.current?.(nextContent);
      });
    }
    return () => {
      active = false;
    };
  }, [contentId, enabled, databaseName, sessionKey]);

  const handleSubscribeContentUpdate = useMemoizedFn((data: ContentEventData) => {
    if (session?.value) return;
    onContentChangeRef.current?.(data.content.content);
    setContent(data.content.content);
  });

  useEffect(() => {
    if (!contentId || !enabled) return;
    if (useContentSessionStore.getState().entries[sessionKey]) return;
    const unSubscribe = contentEditor.subscribeToContentWithId(
      "content:updated",
      contentId,
      handleSubscribeContentUpdate
    );
    return () => unSubscribe();
  }, [contentId, contentEditor, handleSubscribeContentUpdate, enabled]);

  const handleEditorContentChange = useMemoizedFn(async (content: Descendant[]) => {
    if (!contentId || !enabled) return;
    if (useContentSessionStore.getState().entries[sessionKey]) return;
    const updatedContent = await updateContent(contentId, content);
    if (!updatedContent) return;
    setContent(updatedContent.content);
    contentEditor.publishContentEvent("content:updated", updatedContent);
  });

  const {
    run: throttleHandleEditorContentChange,
    cancel,
    flush,
  } = useThrottleFn(handleEditorContentChange, {
    wait: 1000,
  });
  useEffect(() => {
    if (!enabled || session) cancel();
    return () => {
      if (enabled && !useContentSessionStore.getState().entries[sessionKey]) flush();
      else cancel();
    };
  }, [enabled, Boolean(session), sessionKey, cancel, flush]);

  return {
    handleEditorContentChange,
    throttleHandleEditorContentChange,
    content,
    flush,
  };
};

export default useEditContent;
