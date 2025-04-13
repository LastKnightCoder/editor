import { useEffect, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { useShallow } from "zustand/react/shallow";
import { Button, Dropdown, Empty, MenuProps, message } from "antd";
import { produce } from "immer";
import { useNavigate } from "react-router-dom";
import DocumentItem from "../DocumentItem";
import If from "@/components/If";
import { DEFAULT_CREATE_DOCUMENT_ITEM } from "@/constants";
import {
  getDocument,
  getAllArticles,
  getAllCards,
  getAllDocumentItems,
  addRootDocumentItem,
  removeRootDocumentItem,
} from "@/commands";
import { IArticle, ICard, IDocument, IDocumentItem } from "@/types";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import { EDragPosition } from "@/hooks/useDragAndDrop.ts";
import {
  HomeOutlined,
  PlusOutlined,
  MenuFoldOutlined,
} from "@ant-design/icons";

import styles from "./index.module.less";

interface IDocumentProps {
  documentId: number;
}

const Document = (props: IDocumentProps) => {
  const { documentId } = props;

  const [cards, setCards] = useState<ICard[]>([]);
  const [document, setDocument] = useState<IDocument | null>(null);
  const [articles, setArticles] = useState<IArticle[]>([]);
  const [documentItems, setDocumentItemss] = useState<IDocumentItem[]>([]);

  useEffect(() => {
    getDocument(documentId).then((document) => {
      setDocument(document);
    });
    getAllCards().then((cards) => {
      setCards(cards);
    });
    getAllArticles().then((articles) => {
      setArticles(articles);
    });
    getAllDocumentItems().then((documentItems) => {
      setDocumentItemss(documentItems);
    });
  }, []);

  const navigate = useNavigate();

  const { updateDocument, activeDocumentItemId } = useDocumentsStore(
    useShallow((state) => ({
      updateDocument: state.updateDocument,
      activeDocumentItemId: state.activeDocumentItemId,
    })),
  );

  const onFoldSidebar = useMemoizedFn(() => {
    useDocumentsStore.setState({
      hideDocumentItemsList: true,
    });
  });

  const addNewDocumentItem = useMemoizedFn(async () => {
    if (!document) return null;
    const res = await addRootDocumentItem(
      document.id,
      DEFAULT_CREATE_DOCUMENT_ITEM,
    );
    if (!res) return null;
    const [updatedDocument, createdItem] = res;
    setDocument(updatedDocument);
    return createdItem;
  });

  const onAddDocumentItemWithPosition = useMemoizedFn(
    async (id: number, targetId: number, position: EDragPosition) => {
      if (!document) return;
      const targetIndex = document.children.findIndex(
        (childId) => childId === targetId,
      );
      if (targetIndex === -1) {
        message.error("未找到目标位置");
        return;
      }
      const newDocument = produce(document, (draft) => {
        const spliceIndex =
          position === EDragPosition.Top ? targetIndex : targetIndex + 1;
        draft.children.splice(spliceIndex, 0, id);
      });
      const updatedDocument = await updateDocument(newDocument);
      setDocument(updatedDocument);
    },
  );

  const addMenuItems: MenuProps["items"] = [
    {
      key: "add-document-item",
      label: "添加文档",
    },
  ];

  const handleAddMenuClick = useMemoizedFn(async ({ key }: { key: string }) => {
    if (key === "add-document-item") {
      const item = await addNewDocumentItem();
      if (!item) return;
      useDocumentsStore.setState({
        activeDocumentItemId: item.id,
      });
    }
  });

  const onMoveDocumentItem = useMemoizedFn(
    async (sourceId: number, targetId: number, position: EDragPosition) => {
      if (!document) return;
      const sourceIndex = document.children.findIndex(
        (childId) => childId === sourceId,
      );
      const targetIndex = document.children.findIndex(
        (childId) => childId === targetId,
      );
      if (sourceIndex === -1 || targetIndex === -1) {
        message.error("未找到目标位置");
        return;
      }
      const newDocument = produce(document, (draft) => {
        if (sourceIndex < targetIndex) {
          const spliceIndex =
            position === EDragPosition.Top ? targetIndex - 1 : targetIndex;
          draft.children.splice(sourceIndex, 1);
          draft.children.splice(spliceIndex, 0, sourceId);
        } else {
          const spliceIndex =
            position === EDragPosition.Top ? targetIndex : targetIndex + 1;
          draft.children.splice(sourceIndex, 1);
          draft.children.splice(spliceIndex, 0, sourceId);
        }
      });
      const updatedDocument = await updateDocument(newDocument);
      setDocument(updatedDocument);
    },
  );

  const onRemoveDocumentItem = useMemoizedFn(
    async (id: number, notDelete?: boolean) => {
      if (!document) return null;
      const res = await removeRootDocumentItem(document.id, id, notDelete);
      if (!res) return null;
      const [updatedDocument, removedDocumentItem] = res;
      setDocument(updatedDocument);
      return removedDocumentItem;
    },
  );

  if (!document) {
    return <Empty description="知识库不存在或者已被删除" />;
  }

  const { children } = document;

  return (
    <div className={styles.documentContainer}>
      <div className={styles.header}>
        <div className={styles.title}>
          <HomeOutlined
            onClick={() => {
              useDocumentsStore.setState({
                activeDocumentItemId: null,
                hideDocumentItemsList: false,
              });
              navigate(`/documents/list`);
            }}
          />
          {document.title}
        </div>
        <div className={styles.icons}>
          {activeDocumentItemId && (
            <div className={styles.icon} onClick={onFoldSidebar}>
              <MenuFoldOutlined />
            </div>
          )}
          <Dropdown
            menu={{
              items: addMenuItems,
              onClick: handleAddMenuClick,
            }}
          >
            <div className={styles.icon}>
              <PlusOutlined />
            </div>
          </Dropdown>
        </div>
      </div>
      <div className={styles.divider}></div>
      <If condition={children.length === 0}>
        <div className={styles.empty}>
          <Empty description="该知识库下没有内容" />
          <Button onClick={addNewDocumentItem}>添加文档</Button>
        </div>
      </If>
      <If condition={children.length > 0}>
        <div className={styles.document}>
          {children.map((itemId, index) => (
            <DocumentItem
              key={itemId}
              documentId={documentId}
              path={[index]}
              parentChildren={children}
              onParentDeleteChild={onRemoveDocumentItem}
              onParentAddChild={onAddDocumentItemWithPosition}
              onParentMoveChild={onMoveDocumentItem}
              itemId={itemId}
              parentId={document.id}
              isRoot
              cards={cards}
              articles={articles}
              documentItems={documentItems}
            />
          ))}
        </div>
      </If>
    </div>
  );
};

export default Document;
