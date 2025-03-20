import { IDocumentItem } from "@/types";
import { updateDocumentItem } from "@/commands";
import { useRef, useState } from "react";
import { useDebounceFn, useMemoizedFn } from "ahooks";
import { produce } from "immer";
import { Descendant, Editor } from "slate";
import { getContentLength } from "@/utils";

import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import useCardsManagementStore from "@/stores/useCardsManagementStore";

const useEditDoc = () => {
  const { activeDocumentItem } = useDocumentsStore((state) => ({
    activeDocumentItem: state.activeDocumentItem,
  }));
  const { initCards } = useCardsManagementStore((state) => ({
    initCards: state.init,
  }));
  const [initValue] = useState<Descendant[]>(() => {
    if (!activeDocumentItem)
      return [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: "" }],
        },
      ];
    return activeDocumentItem.content;
  });
  const prevDocument = useRef<IDocumentItem | null>(activeDocumentItem);

  const saveDocument = useMemoizedFn((saveAnyway = false) => {
    const changed =
      JSON.stringify(activeDocumentItem) !==
      JSON.stringify(prevDocument.current);
    if (!activeDocumentItem || !(changed || saveAnyway)) return;
    updateDocumentItem(activeDocumentItem).then((updatedDoc) => {
      useDocumentsStore.setState({ activeDocumentItem: updatedDoc });
      prevDocument.current = updatedDoc;
    });
    if (activeDocumentItem.isCard && activeDocumentItem.cardId) {
      // 更新卡片数据，暂时拉取全部数据
      initCards();
    }
  });

  const onInit = useMemoizedFn((editor: Editor, content: Descendant[]) => {
    if (!editor || !activeDocumentItem) return;
    const wordsCount = getContentLength(content);
    const newDocumentItem = produce(activeDocumentItem, (draft) => {
      draft.count = wordsCount;
    });
    useDocumentsStore.setState({ activeDocumentItem: newDocumentItem });
  });

  const onTitleChange = useMemoizedFn((title: string) => {
    if (!activeDocumentItem) return;
    const newDocument = produce(activeDocumentItem, (draft) => {
      draft.title = title;
    });
    useDocumentsStore.setState({ activeDocumentItem: newDocument });
  });

  const { run: onContentChange } = useDebounceFn(
    (content: Descendant[]) => {
      if (!activeDocumentItem) return;
      const wordsCount = getContentLength(content);
      const newDocument = produce(activeDocumentItem, (draft) => {
        draft.content = content;
        draft.count = wordsCount;
      });
      useDocumentsStore.setState({ activeDocumentItem: newDocument });
    },
    { wait: 500 },
  );

  return {
    onTitleChange,
    onContentChange,
    saveDocument,
    activeDocumentItem,
    initValue,
    onInit,
  };
};

export default useEditDoc;
