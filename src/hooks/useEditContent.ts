import { useEffect, useState } from "react";
import { Descendant } from "slate";
import { updateContent, getContentById } from "@/commands";
import { useMemoizedFn, useCreation, useThrottleFn } from "ahooks";
import { defaultContentEventBus, ContentEventData } from "@/utils";

const DEFAULT_CONTENT: Descendant[] = [
  {
    type: "paragraph",
    disableDrag: false,
    children: [{ type: "formatted", text: "" }],
  },
];

const useEditContent = (
  contentId: number | undefined,
  onContentChange: (content: Descendant[]) => void,
) => {
  const contentEditor = useCreation(
    () => defaultContentEventBus.createEditor(),
    [],
  );
  const [content, setContent] = useState<Descendant[]>(DEFAULT_CONTENT);

  useEffect(() => {
    if (!contentId) {
      setContent(DEFAULT_CONTENT);
    }
    if (contentId) {
      getContentById(contentId).then((content) => {
        setContent(content?.content || DEFAULT_CONTENT);
      });
    }
  }, [contentId]);

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
  }, [contentId, contentEditor, handleSubscribeContentUpdate]);

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
