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
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import { defaultCardEventBus, defaultArticleEventBus } from "@/utils";

const useEditDoc = () => {
  const activeDocumentItemId = useDocumentsStore(
    (state) => state.activeDocumentItemId,
  );
  const [initValue, setInitValue] = useState<Descendant[]>([
    {
      type: "paragraph",
      children: [{ type: "formatted", text: "" }],
    },
  ]);
  const [activeDocumentItem, setActiveDocumentItem] =
    useState<IDocumentItem | null>(null);

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
    if (!activeDocumentItemId) return;
    const documentItem = await getDocumentItem(activeDocumentItemId);
    setActiveDocumentItem(documentItem);
    prevDocument.current = documentItem;
    setInitValue(documentItem.content);
  }, [activeDocumentItemId]);

  const saveDocument = useMemoizedFn(async (saveAnyway = false) => {
    const changed =
      JSON.stringify(activeDocumentItem) !==
      JSON.stringify(prevDocument.current);
    if (!activeDocumentItem || !(changed || saveAnyway)) return;
    const updatedDoc = await updateDocumentItem(activeDocumentItem);
    setActiveDocumentItem(updatedDoc);
    prevDocument.current = updatedDoc;
    if (activeDocumentItem.isCard && activeDocumentItem.cardId) {
      const card = await getCardById(activeDocumentItem.cardId);
      cardEventBus.publishCardEvent("card:updated", card);
    } else if (activeDocumentItem.isArticle && activeDocumentItem.articleId) {
      const article = await findOneArticle(activeDocumentItem.articleId);
      articleEventBus.publishArticleEvent("article:updated", article);
    }
  });

  const onInit = useMemoizedFn((editor: Editor, content: Descendant[]) => {
    if (!editor || !activeDocumentItem) return;
    const wordsCount = getContentLength(content);
    const newDocumentItem = produce(activeDocumentItem, (draft) => {
      draft.count = wordsCount;
    });
    setActiveDocumentItem(newDocumentItem);
  });

  const onTitleChange = useMemoizedFn((title: string) => {
    if (!activeDocumentItem) return;
    const newDocument = produce(activeDocumentItem, (draft) => {
      draft.title = title;
    });
    setActiveDocumentItem(newDocument);
  });

  const { run: onContentChange } = useDebounceFn(
    (content: Descendant[]) => {
      if (!activeDocumentItem) return;
      const wordsCount = getContentLength(content);
      const newDocument = produce(activeDocumentItem, (draft) => {
        draft.content = content;
        draft.count = wordsCount;
      });
      setActiveDocumentItem(newDocument);
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
    setActiveDocumentItem,
  };
};

export default useEditDoc;
