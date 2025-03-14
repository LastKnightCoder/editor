import { useMemoizedFn } from "ahooks";
import { Button, Dropdown, Empty, MenuProps, message } from "antd";
import { produce } from "immer";
import { useNavigate } from "react-router-dom";
import DocumentItem from "../DocumentItem";
import If from "@/components/If";
import { DEFAULT_CREATE_DOCUMENT_ITEM } from "@/constants";
import { createDocumentItem } from "@/commands";

import { IDocument } from "@/types";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import { EDragPosition } from "@/hooks/useDragAndDrop.ts";

import styles from "./index.module.less";
import {
  HomeOutlined,
  MenuFoldOutlined,
  PlusOutlined,
} from "@ant-design/icons";

interface IDocumentProps {
  document: IDocument;
}

const Document = (props: IDocumentProps) => {
  const { document } = props;
  const { children } = document;

  const navigate = useNavigate();

  const { addDocumentItem, updateDocument, activeDocumentItem } =
    useDocumentsStore((state) => ({
      addDocumentItem: state.addDocumentItem,
      updateDocument: state.updateDocument,
      activeDocumentItem: state.activeDocumentItem,
    }));

  const addNewDocumentItem = useMemoizedFn(async () => {
    const createdItem = await createDocumentItem(DEFAULT_CREATE_DOCUMENT_ITEM);
    addDocumentItem(document.id, createdItem.id);
    return createdItem;
  });

  const onAddDocumentItemWithPosition = useMemoizedFn(
    async (id: number, targetId: number, position: EDragPosition) => {
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
      await updateDocument(newDocument);
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
      useDocumentsStore.setState({
        activeDocumentItem: item,
      });
    }
  });

  const onMoveDocumentItem = useMemoizedFn(
    async (sourceId: number, targetId: number, position: EDragPosition) => {
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
      await updateDocument(newDocument);
    },
  );

  const onRemoveDocumentItem = useMemoizedFn(async (id: number) => {
    const newDocument = produce(document, (draft) => {
      draft.children = draft.children.filter((childId) => childId !== id);
    });
    await updateDocument(newDocument);
  });

  const onFoldSidebar = useMemoizedFn(() => {
    useDocumentsStore.setState({
      hideDocumentItemsList: true,
    });
  });

  return (
    <div className={styles.documentContainer}>
      <div className={styles.header}>
        <div className={styles.title}>
          <HomeOutlined
            onClick={() => {
              useDocumentsStore.setState({
                activeDocumentId: null,
                activeDocumentItem: null,
                hideDocumentItemsList: false,
              });
              navigate(`/documents`);
            }}
          />
          {document.title}
        </div>
        <div className={styles.icons}>
          {activeDocumentItem && (
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
          <Empty description="该文档下没有内容" />
          <Button type="primary" onClick={addNewDocumentItem}>
            添加文档
          </Button>
        </div>
      </If>
      <If condition={children.length > 0}>
        <div className={styles.document}>
          {children.map((itemId, index) => (
            <DocumentItem
              key={itemId}
              path={[index]}
              parentChildren={children}
              onParentDeleteChild={onRemoveDocumentItem}
              onParentAddChild={onAddDocumentItemWithPosition}
              onParentMoveChild={onMoveDocumentItem}
              itemId={itemId}
              parentId={document.id}
              isRoot
            />
          ))}
        </div>
      </If>
    </div>
  );
};

export default Document;
