import { useState } from "react";
import { App, message, Popover } from "antd";
import { MoreOutlined, PlusOutlined, FolderOutlined, FileOutlined } from "@ant-design/icons";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { produce } from "immer";
import classnames from "classnames";
import { motion } from 'framer-motion';

import If from "@/components/If";
import { createDocumentItem, getDocumentItem, updateDocumentItem } from "@/commands";
import { DEFAULT_CREATE_DOCUMENT_ITEM } from "@/constants";
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import useDragAndDrop, { EDragPosition, IDragItem } from './useDragAndDrop.ts';

import { IArticle, ICard, IDocumentItem } from "@/types";

import styles from './index.module.less';
import SelectCardModal from "@/components/SelectCardModal";
import SelectArticleModal from "@/components/SelectArticleModal";

interface IDocumentItemProps {
  itemId: number;
  parentId: number;
  isRoot?: boolean;
  onParentDeleteChild: (id: number) => Promise<void>;
  onParentAddChild: (id: number, targetId: number, position: EDragPosition) => Promise<void>;
  onParentMoveChild: (sourceId: number, targetId: number, position: EDragPosition) => Promise<void>;
  path: number[];
}

const DocumentItem = (props: IDocumentItemProps) => {
  const { itemId, path, parentId, isRoot = false, onParentDeleteChild, onParentAddChild, onParentMoveChild } = props;

  const [item, setItem] = useState<IDocumentItem | null>(null);
  const [addPopoverOpen, setAddPopoverOpen] = useState(false);
  const [morePopoverOpen, setMorePopoverOpen] = useState(false);
  const [selectCardModalOpen, setSelectCardModalOpen] = useState(false);
  const [selectedCards, setSelectedCards] = useState<ICard[]>([]);
  const [selectArticleModalOpen, setSelectArticleModalOpen] = useState(false);
  const { modal } = App.useApp();

  const {
    cards,
  } = useCardsManagementStore(state => ({
    cards: state.cards,
  }));

  const {
    articles,
  } = useArticleManagementStore(state => ({
    articles: state.articles,
  }))

  const {
    activeDocumentItemId,
    activeDocumentItem,
    activeDocumentItemPath,
  } = useDocumentsStore(state => ({
    activeDocumentItemId: state.activeDocumentItemId,
    activeDocumentItem: state.activeDocumentItem,
    activeDocumentItemPath: state.activeDocumentItemPath,
  }));

  useAsyncEffect(async () => {
    const item = await getDocumentItem(itemId);
    if (!item) {
      return;
    }
    setItem(item);
  }, [itemId]);

  const onDrop = useMemoizedFn(async (dragItem: IDragItem, dragPosition: EDragPosition) => {
    const { itemId: dragId, parentId: dragParentId } = dragItem;
    if (dragPosition === EDragPosition.Inside) {
      await onAddDocumentItemWithPosition(dragId, itemId, dragPosition);
    } else {
      if (dragParentId === parentId) {
        // 此时操作的是同一对象，不能先加后删，否则后面的会覆盖前面的
        await onParentMoveChild(dragId, itemId, dragPosition);
      } else {
        await onParentAddChild(dragId, itemId, dragPosition);
      }
    }
  })

  const onDragEnd = useMemoizedFn(async (dragItem: IDragItem) => {
    await onParentDeleteChild(dragItem.itemId);
  })

  const {
    drag,
    drop,
    isDragging,
    dropContainerRef,
    dragPosition,
    isOver,
    canDrop,
  } = useDragAndDrop({
    itemId,
    parentId,
    isRoot,
    path,
    onDrop,
    onDragEnd,
  });

  const onAddNewDocumentItem = useMemoizedFn(async () => {
    if (!item) {
      return;
    }
    const itemId = await createDocumentItem(DEFAULT_CREATE_DOCUMENT_ITEM);
    const newItem = produce(item, draft => {
      draft.children.push(itemId);
    });
    const updatedDoc = await updateDocumentItem(newItem);
    setItem(updatedDoc);
    if (item.id === activeDocumentItemId) {
      useDocumentsStore.setState({
        activeDocumentItem: updatedDoc,
      });
    }
  })
  
  const onAddDocumentItemWithPosition = useMemoizedFn(async (id: number, targetId: number, position: EDragPosition) => {
    if (!item) {
      return;
    }
    let newItem: IDocumentItem;
    if (position === EDragPosition.Inside) {
      // 加入当前文档的开头
      newItem = produce(item, draft => {
        draft.children.unshift(id);
      });
    } else {
      const targetIndex = item.children.findIndex(childId => childId === targetId);
      if (targetIndex === -1) {
        return;
      }
      const sliceIndex = position === EDragPosition.Top ? targetIndex : targetIndex + 1;
      newItem = produce(item, draft => {
        draft.children.splice(sliceIndex, 0, id);
      });
    }

    const updatedDoc = await updateDocumentItem(newItem);
    setItem(updatedDoc);
    if (item.id === activeDocumentItemId) {
      useDocumentsStore.setState({
        activeDocumentItem: updatedDoc,
      });
    }
  })

  const onRemoveDocumentItem = useMemoizedFn(async (id: number) => {
    if (!item) {
      return;
    }
    const newItem = produce(item, draft => {
      draft.children = draft.children.filter(childId => childId !== id);
    });
    const updatedDoc = await updateDocumentItem(newItem);
    setItem(updatedDoc);
    if (item.id === activeDocumentItemId) {
      useDocumentsStore.setState({
        activeDocumentItem: updatedDoc,
      });
    }
  });

  const onMoveDocumentItem = useMemoizedFn(async (sourceId: number, targetId: number, position: EDragPosition) => {
    // 处理同级别的移动
    if (!item) {
      return;
    }
    const sourceIndex = item.children.findIndex(childId => childId === sourceId);
    const targetIndex = item.children.findIndex(childId => childId === targetId);
    if (targetIndex === -1 || sourceIndex === -1) {
      message.error('未找到目标位置');
      return;
    }
    // 把 sourceIndex 的元素删除，然后插入到 targetIndex 的位置
    const newItem = produce(item, draft => {
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
    const updatedDoc = await updateDocumentItem(newItem);
    setItem(updatedDoc);
    if (item.id === activeDocumentItemId) {
      useDocumentsStore.setState({
        activeDocumentItem: updatedDoc,
      });
    }
  });

  const onClickDelete = useMemoizedFn(() => {
    if (!item) return;
    modal.confirm({
      title: '是否删除文档',
      content: item.children.length > 0 ? '该文档下包含多篇子文档，是否删除' : '删除后无法恢复',
      onOk: async () => {
        await onParentDeleteChild(item.id);
        if (activeDocumentItemPath && activeDocumentItemPath.length > 0 && activeDocumentItemPath.length > path.length) {
          // 如果当前编辑的文档是被删除的文档的子文档，则清空编辑器
          for (let i = 0; i < path.length; i++) {
            if (activeDocumentItemPath[i] !== path[i]) {
              return;
            }
          }
          useDocumentsStore.setState({
            activeDocumentItemId: null,
            activeDocumentItem: null,
            activeDocumentItemPath: [],
          });
        }
      },
      okText: '删除',
      cancelText: '取消',
      okButtonProps: {
        danger: true,
      }
    })
  });

  const onSelectCardFinish = useMemoizedFn(async (selectedCards: ICard[]) => {
    if (selectedCards.length === 0) {
      message.warning('请选择卡片');
      return;
    }
    if (!item) {
      return;
    }
    const cardItemId = await createDocumentItem({
      ...DEFAULT_CREATE_DOCUMENT_ITEM,
      isCard: true,
      cardId: selectedCards[0].id,
      content: selectedCards[0].content,
    });
    const newItem = produce(item, draft => {
      draft.children.push(cardItemId);
    });
    const updatedDoc = await updateDocumentItem(newItem);
    setItem(updatedDoc);
    if (item.id === activeDocumentItemId) {
      useDocumentsStore.setState({
        activeDocumentItem: updatedDoc,
      });
    }
    setSelectCardModalOpen(false);
  });

  const onSelectArticleFinish = useMemoizedFn(async (selectedArticles: IArticle[]) => {
    if (selectedArticles.length === 0) {
      message.warning('请选择文章');
      return;
    }
    if (!item) {
      return;
    }
    const articleItemId = await createDocumentItem({
      ...DEFAULT_CREATE_DOCUMENT_ITEM,
      isArticle: true,
      articleId: selectedArticles[0].id,
      title: selectedArticles[0].title,
      content: selectedArticles[0].content,
    });
    const newItem = produce(item, draft => {
      draft.children.push(articleItemId);
    });
    const updatedDoc = await updateDocumentItem(newItem);
    setItem(updatedDoc);
    if (item.id === activeDocumentItemId) {
      useDocumentsStore.setState({
        activeDocumentItem: updatedDoc,
      });
    }
    setSelectArticleModalOpen(false);
  });

  useAsyncEffect(async () => {
    if (activeDocumentItemId === itemId) {
      setItem(activeDocumentItem);
    }
  }, [itemId, activeDocumentItemId, activeDocumentItem]);

  if (!item) {
    return null;
  }

  return (
    <motion.div layoutId={String(item.id)} ref={drag} className={classnames(styles.item, {
      [styles.dragging]: isDragging,
    })}>
      <div
        ref={node => {
          dropContainerRef.current = node;
          drop(node);
        }}
        className={classnames(styles.header, {
          [styles.active]: activeDocumentItemId === item.id,
          [styles.top]: isOver && canDrop && dragPosition === EDragPosition.Top,
          [styles.bottom]: isOver && canDrop && dragPosition === EDragPosition.Bottom,
          [styles.inside]: isOver && canDrop && dragPosition === EDragPosition.Inside,
        })}
        onClick={() => {
          useDocumentsStore.setState({
            activeDocumentItemId: item.id,
            activeDocumentItem: item,
            activeDocumentItemPath: path,
          });
        }}
      >
        <div className={styles.titleContainer}>
          <div className={styles.icon}>
            {
              item.children.length > 0 ? <FolderOutlined /> : <FileOutlined />
            }
          </div>
          <div className={styles.title}>
            {item.title}
          </div>
        </div>
        <div className={styles.icons}>
          <Popover
            open={morePopoverOpen}
            onOpenChange={setMorePopoverOpen}
            trigger={'click'}
            content={(
              <div className={styles.settings}>
                <div className={styles.item} onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClickDelete();
                  setMorePopoverOpen(false);
                }}>删除文档</div>
              </div>
            )}
            placement={'bottomLeft'}
            arrow={false}
            overlayInnerStyle={{ padding: 0 }}
          >
            <div className={styles.icon} onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}>
              <MoreOutlined />
            </div>
          </Popover>
          <Popover
            open={addPopoverOpen}
            onOpenChange={setAddPopoverOpen}
            trigger={'click'}
            content={(
              <div className={styles.settings}>
                <div className={styles.item} onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setAddPopoverOpen(false);
                  await onAddNewDocumentItem();
                }}>添加文档</div>
                <div
                  className={styles.item}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setAddPopoverOpen(false);
                    setSelectCardModalOpen(true);
                  }}
                >
                  关联卡片
                </div>
                <div
                  className={styles.item}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setAddPopoverOpen(false);
                    setSelectArticleModalOpen(true);
                  }}
                >
                  关联文章
                </div>
              </div>
            )}
            placement={'bottomLeft'}
            arrow={false}
            overlayInnerStyle={{ padding: 0 }}
          >
            <div className={styles.icon} onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}>
              <PlusOutlined />
            </div>
          </Popover>
        </div>
      </div>
      <If condition={item.children.length > 0}>
        <div className={styles.children}>
          {
            item.children.map((id, index) => (
              <DocumentItem
                key={id}
                itemId={id}
                parentId={item.id}
                onParentDeleteChild={onRemoveDocumentItem}
                onParentAddChild={onAddDocumentItemWithPosition}
                onParentMoveChild={onMoveDocumentItem}
                path={[...path, index]}
              />
            ))
          }
        </div>
      </If>
      <SelectCardModal
        title={'选择关联卡片'}
        selectedCards={selectedCards}
        onChange={setSelectedCards}
        open={selectCardModalOpen}
        allCards={cards}
        onCancel={() => { setSelectCardModalOpen(false); }}
        onOk={onSelectCardFinish}
        excludeCardIds={[activeDocumentItem?.cardId || -1]}
      />
      <SelectArticleModal
        title={'选择关联文章'}
        open={selectArticleModalOpen}
        allItems={articles}
        excludeIds={[activeDocumentItem?.articleId || -1]}
        onCancel={() => { setSelectArticleModalOpen(false); }}
        onOk={onSelectArticleFinish}
      />
    </motion.div>
  )
}

export default DocumentItem;