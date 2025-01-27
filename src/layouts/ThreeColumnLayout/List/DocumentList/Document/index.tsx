import { useMemoizedFn } from "ahooks";
import { Button, Empty, message } from "antd";
import { produce } from "immer";
import { motion } from "framer-motion";

import DocumentItem from "../DocumentItem";
import If from "@/components/If";
import { DEFAULT_CREATE_DOCUMENT_ITEM } from "@/constants";
import { createDocumentItem } from "@/commands";

import { IDocument } from "@/types";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import { EDragPosition } from "@/hooks/useDragAndDrop.ts";

import styles from './index.module.less';

interface IDocumentProps {
  document: IDocument;
}

const Document = (props: IDocumentProps) => {
  const { document } = props;
  const { children } = document;

  const {
    addDocumentItem,
    updateDocument,
  } = useDocumentsStore(state => ({
    addDocumentItem: state.addDocumentItem,
    updateDocument: state.updateDocument,
  }));

  const addNewDocumentItem = useMemoizedFn(async () => {
    const createedItem = await createDocumentItem(DEFAULT_CREATE_DOCUMENT_ITEM);
    addDocumentItem(document.id, createedItem.id);
  });
  
  const onAddDocumentItemWithPosition = useMemoizedFn(async (id: number, targetId: number, position: EDragPosition) => {
    const targetIndex = document.children.findIndex(childId => childId === targetId);
    if (targetIndex === -1) {
      message.error('未找到目标位置');
      return;
    }
    const newDocument = produce(document, draft => {
      const spliceIndex = position === EDragPosition.Top ? targetIndex : targetIndex + 1;
      draft.children.splice(spliceIndex, 0, id);
    });
    await updateDocument(newDocument);
  })
  
  const onMoveDocumentItem = useMemoizedFn(async (sourceId: number, targetId: number, position: EDragPosition) => {
    const sourceIndex = document.children.findIndex(childId => childId === sourceId);
    const targetIndex = document.children.findIndex(childId => childId === targetId);
    if (sourceIndex === -1 || targetIndex === -1) {
      message.error('未找到目标位置');
      return;
    }
    const newDocument = produce(document, draft => {
      if (sourceIndex < targetIndex) {
        const spliceIndex = position === EDragPosition.Top ? targetIndex - 1 : targetIndex;
        draft.children.splice(sourceIndex, 1);
        draft.children.splice(spliceIndex, 0, sourceId);
      } else {
        const spliceIndex = position === EDragPosition.Top ? targetIndex : targetIndex + 1;
        draft.children.splice(sourceIndex, 1);
        draft.children.splice(spliceIndex, 0, sourceId);
      }
    });
    await updateDocument(newDocument);
  });

  const onRemoveDocumentItem = useMemoizedFn(async (id: number) => {
    const newDocument = produce(document, draft => {
      draft.children = draft.children.filter(childId => childId !== id);
    });
    await updateDocument(newDocument);
  });

  return (
    <div className={styles.documentContainer}>
      <If condition={children.length === 0}>
        <div className={styles.empty}>
          <Empty description="该文档下没有内容" />
          <Button type="primary" onClick={addNewDocumentItem}>添加文档</Button>
        </div>
      </If>
      <If condition={children.length > 0}>
        <motion.div className={styles.document}>
          {
            children.map((itemId, index) => (
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
            ))
          }
        </motion.div>
      </If>
    </div>
  )
}

export default Document;