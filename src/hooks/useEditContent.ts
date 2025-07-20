import { useEffect, useState } from "react";
import { Descendant } from "slate";
import { updateContent } from "@/commands";
import { useMemoizedFn, useCreation, useThrottleFn } from "ahooks";
import { defaultContentEventBus, ContentEventData } from "@/utils";

const useEditContent = (
  contentId: number | undefined,
  onContentChange: (content: Descendant[]) => void,
) => {
  const contentEditor = useCreation(
    () => defaultContentEventBus.createEditor(),
    [],
  );
  const [content, setContent] = useState<Descendant[]>([]);

  const handleSubscribeContentUpdate = useMemoizedFn(
    (data: ContentEventData) => {
      onContentChange(data.content.content);
      setContent(data.content.content);
    },
  );

  useEffect(() => {
    if (!contentId) return;
    const unSubscribe = contentEditor.subscribeToContentWithId(
      "content:updated",
      contentId,
      handleSubscribeContentUpdate,
    );
    return () => unSubscribe();
  }, [contentId, contentEditor]);

  const handleEditorContentChange = useMemoizedFn(
    async (content: Descendant[]) => {
      if (!contentId) return;
      const updatedContent = await updateContent(contentId, content);
      if (!updatedContent) return;
      setContent(updatedContent.content);
      contentEditor.publishContentEvent("content:updated", updatedContent);
    },
  );

  const { run: throttleHandleEditorContentChange } = useThrottleFn(
    handleEditorContentChange,
    {
      wait: 1000,
    },
  );

  return {
    handleEditorContentChange,
    throttleHandleEditorContentChange,
    content,
  };
};

export default useEditContent;
