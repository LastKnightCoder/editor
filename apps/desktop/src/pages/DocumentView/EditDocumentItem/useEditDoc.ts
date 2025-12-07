import { IDocumentItem } from "@/types";
import {
  findOneArticle,
  getCardById,
  getDocumentItem,
  updateDocumentItem,
} from "@/commands";
import { useRef, useState } from "react";
import { useAsyncEffect, useCreation, useMemoizedFn } from "ahooks";
import { produce } from "immer";
import { Descendant, Editor } from "slate";
import { getContentLength } from "@/utils";
import { defaultCardEventBus, defaultArticleEventBus } from "@/utils";

const useEditDoc = (documentItemId: number | null) => {
  const [initValue, setInitValue] = useState<Descendant[]>([
    {
      type: "paragraph",
      children: [{ type: "formatted", text: "" }],
    },
  ]);
  const [documentItem, setDocumentItem] = useState<IDocumentItem | null>(null);

  const setDocumentItemAndRef = useMemoizedFn((documentItem: IDocumentItem) => {
    setDocumentItem(documentItem);
    documentRef.current = documentItem;
  });

  const documentRef = useRef<IDocumentItem | null>(null);
  const prevDocument = useRef<IDocumentItem | null>(null);
  const cardEventBus = useCreation(
    () => defaultCardEventBus.createEditor(),
    [],
  );
  const articleEventBus = useCreation(
    () => defaultArticleEventBus.createEditor(),
    [],
  );

  useAsyncEffect(async () => {
    if (!documentItemId) return;
    const documentItem = await getDocumentItem(documentItemId);
    if (!documentItem) return;
    setDocumentItemAndRef(documentItem);
    prevDocument.current = documentItem;
    setInitValue(documentItem.content);
  }, [documentItemId]);

  const saveDocument = useMemoizedFn(async () => {
    const changed =
      JSON.stringify({
        ...documentRef.current,
        content: undefined,
        count: undefined,
      }) !==
      JSON.stringify({
        ...prevDocument.current,
        content: undefined,
        count: undefined,
      });
    if (!documentRef.current || !changed) return;
    const updatedDoc = await updateDocumentItem(documentRef.current);
    if (!updatedDoc) return;

    setDocumentItemAndRef(updatedDoc);
    prevDocument.current = updatedDoc;

    if (updatedDoc.isCard && updatedDoc.cardId) {
      const card = await getCardById(updatedDoc.cardId);
      cardEventBus.publishCardEvent("card:updated", card);
    } else if (updatedDoc.isArticle && updatedDoc.articleId) {
      const article = await findOneArticle(updatedDoc.articleId);
      articleEventBus.publishArticleEvent("article:updated", article);
    }

    return updatedDoc;
  });

  const onInit = useMemoizedFn((editor: Editor, content: Descendant[]) => {
    if (!editor || !documentRef.current) return;
    const wordsCount = getContentLength(content);
    const newDocumentItem = produce(documentRef.current, (draft) => {
      draft.count = wordsCount;
    });
    setDocumentItemAndRef(newDocumentItem);
  });

  const onTitleChange = useMemoizedFn((title: string) => {
    if (!documentRef.current) return;
    const newDocument = produce(documentRef.current, (draft) => {
      draft.title = title;
    });
    setDocumentItemAndRef(newDocument);
  });

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!documentRef.current) return;
    const wordsCount = getContentLength(content);
    const newDocument = produce(documentRef.current, (draft) => {
      draft.content = content;
      draft.count = wordsCount;
    });
    setDocumentItemAndRef(newDocument);
  });

  return {
    onTitleChange,
    onContentChange,
    saveDocument,
    documentItem,
    initValue,
    onInit,
    setDocumentItem: setDocumentItemAndRef,
    prevDocument,
  };
};

export default useEditDoc;
