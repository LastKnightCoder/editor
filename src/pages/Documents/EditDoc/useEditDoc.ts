import { IDocumentItem } from "@/types";
import { updateDocumentItem } from "@/commands";
import { useEffect, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import { Descendant, Editor } from "slate";
import { getEditorTextLength } from "@/utils";

import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import useCardsManagementStore from "@/stores/useCardsManagementStore";

const useEditDoc = () => {
  const {
    activeDocumentItem,
  } = useDocumentsStore((state) => ({
    activeDocumentItem: state.activeDocumentItem,
  }));
  const {
    initCards,
  } = useCardsManagementStore((state) => ({
    initCards: state.init,
  }));
  const [initValue] = useState<Descendant[]>(() => {
    if (!activeDocumentItem) return [{
      type: 'paragraph',
      children: [{ type: 'formatted', text: '' }],
    }];
    return activeDocumentItem.content;
  });
  const [wordsCount, setWordsCount] = useState(0);
  const prevDocument = useRef<IDocumentItem | null>(activeDocumentItem);
  const documentChanged = useRef(false);

  useEffect(() => {
    if (!activeDocumentItem || !prevDocument.current) return;
    documentChanged.current = JSON.stringify(activeDocumentItem) !== JSON.stringify(prevDocument.current);
  }, [activeDocumentItem]);

  const saveDocument = useMemoizedFn((saveAnyway = false) => {
    if (!activeDocumentItem || !(documentChanged.current || saveAnyway)) return;
    updateDocumentItem(activeDocumentItem).then((updatedDoc) => {
      useDocumentsStore.setState({ activeDocumentItem: updatedDoc });
      prevDocument.current = updatedDoc;
      documentChanged.current = false;
    });
    if (activeDocumentItem.isCard && activeDocumentItem.cardId) {
      // 更新卡片数据，暂时拉取全部数据
      initCards();
    }
  });

  const onInit = useMemoizedFn((editor: Editor, content: Descendant[]) => {
    if (!editor) return;
    const wordsCount = getEditorTextLength(editor, content);
    setWordsCount(wordsCount);
  })

  const onTitleChange = useMemoizedFn((title: string) => {
    if (!activeDocumentItem) return;
    const newDocument = produce(activeDocumentItem, draft => {
      draft.title = title;
    });
    useDocumentsStore.setState({ activeDocumentItem: newDocument });
  });

  const onContentChange = useMemoizedFn((content: Descendant[], editor?: Editor) => {
    if(!activeDocumentItem) return;
    const newDocument = produce(activeDocumentItem, draft => {
      draft.content = content;
    })
    useDocumentsStore.setState({ activeDocumentItem: newDocument });
    if (editor) {
      const wordsCount = getEditorTextLength(editor, content);
      setWordsCount(wordsCount);
    }
  });

  return {
    onTitleChange,
    onContentChange,
    saveDocument,
    activeDocumentItem,
    initValue,
    onInit,
    wordsCount,
  }
}

export default useEditDoc;