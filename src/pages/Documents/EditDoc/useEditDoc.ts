import { IDocumentItem } from "@/types";
import { updateDocumentItem } from "@/commands";
import { useEffect, useRef } from "react";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import { Descendant } from "slate";

const useEditDoc = () => {
  const {
    activeDocumentItem,
  } = useDocumentsStore((state) => ({
    activeDocumentItem: state.activeDocumentItem,
  }));
  const prevDocument = useRef<IDocumentItem | null>(activeDocumentItem);
  const documentChanged = useRef(false);

  useEffect(() => {
    if (!activeDocumentItem || !prevDocument.current) return;
    documentChanged.current = JSON.stringify(activeDocumentItem) !== JSON.stringify(prevDocument.current);
  }, [activeDocumentItem]);

  const saveDocument = useMemoizedFn((saveAnyway = false) => {
    if (!activeDocumentItem || !(documentChanged.current || saveAnyway)) return;
    console.log('save document');
    updateDocumentItem(activeDocumentItem).then(() => {
      prevDocument.current = activeDocumentItem;
      documentChanged.current = false;
    });
  });

  const onTitleChange = useMemoizedFn((title: string) => {
    if (!activeDocumentItem) return;
    const newDocument = produce(activeDocumentItem, draft => {
      draft.title = title;
    });
    useDocumentsStore.setState({ activeDocumentItem: newDocument });
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    if(!activeDocumentItem) return;
    const newDocument = produce(activeDocumentItem, draft => {
      draft.content = content;
    })
    useDocumentsStore.setState({ activeDocumentItem: newDocument });
  });

  return {
    onTitleChange,
    onContentChange,
    saveDocument,
    activeDocumentItem,
  }
}

export default useEditDoc;