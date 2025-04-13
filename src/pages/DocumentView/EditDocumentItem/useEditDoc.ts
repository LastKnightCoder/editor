import { IDocumentItem } from "@/types";
import {
  findOneArticle,
  getCardById,
  getDocumentItem,
  updateDocumentItem,
} from "@/commands";
import { useRef, useState } from "react";
import {
  useAsyncEffect,
  useCreation,
  useDebounceFn,
  useMemoizedFn,
} from "ahooks";
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
    setDocumentItem(documentItem);
    prevDocument.current = documentItem;
    setInitValue(documentItem.content);
  }, [documentItemId]);

  const saveDocument = useMemoizedFn(async () => {
    const changed =
      JSON.stringify(documentItem) !== JSON.stringify(prevDocument.current);
    if (!documentItem || !changed) return;
    const updatedDoc = await updateDocumentItem(documentItem);
    setDocumentItem(updatedDoc);
    prevDocument.current = updatedDoc;
    if (documentItem.isCard && documentItem.cardId) {
      const card = await getCardById(documentItem.cardId);
      cardEventBus.publishCardEvent("card:updated", card);
    } else if (documentItem.isArticle && documentItem.articleId) {
      const article = await findOneArticle(documentItem.articleId);
      articleEventBus.publishArticleEvent("article:updated", article);
    }
    return updatedDoc;
  });

  const onInit = useMemoizedFn((editor: Editor, content: Descendant[]) => {
    if (!editor || !documentItem) return;
    const wordsCount = getContentLength(content);
    const newDocumentItem = produce(documentItem, (draft) => {
      draft.count = wordsCount;
    });
    setDocumentItem(newDocumentItem);
  });

  const { run: onTitleChange } = useDebounceFn(
    (title: string) => {
      if (!documentItem) return;
      const newDocument = produce(documentItem, (draft) => {
        draft.title = title;
      });
      setDocumentItem(newDocument);
    },
    { wait: 200 },
  );

  const { run: onContentChange } = useDebounceFn(
    (content: Descendant[]) => {
      if (!documentItem) return;
      const wordsCount = getContentLength(content);
      const newDocument = produce(documentItem, (draft) => {
        draft.content = content;
        draft.count = wordsCount;
      });
      setDocumentItem(newDocument);
    },
    { wait: 200 },
  );

  return {
    onTitleChange,
    onContentChange,
    saveDocument,
    documentItem,
    initValue,
    onInit,
    setDocumentItem,
    prevDocument,
  };
};

export default useEditDoc;
