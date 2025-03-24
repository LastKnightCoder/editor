import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { App, Dropdown, MenuProps, message, Tooltip } from "antd";
import {
  FileOutlined,
  MoreOutlined,
  PlusOutlined,
  FolderOpenTwoTone,
} from "@ant-design/icons";
import { useAsyncEffect, useMemoizedFn } from "ahooks";
import { produce } from "immer";
import classnames from "classnames";

import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import useArticleManagementStore from "@/stores/useArticleManagementStore.ts";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import useDragAndDrop, {
  EDragPosition,
  IDragItem,
} from "@/hooks/useDragAndDrop.ts";

import {
  createDocumentItem,
  getAllDocumentItems,
  getDocumentItem,
  getDocumentItemAllParents,
  isDocumentItemChildOf,
  updateDocumentItem,
  openDocumentItemInNewWindow,
} from "@/commands";
import SelectCardModal from "@/components/SelectCardModal";
import SelectModal from "@/components/SelectModal";
import PresentationMode from "@/components/PresentationMode";
import { DEFAULT_CREATE_DOCUMENT_ITEM } from "@/constants";
import { IArticle, ICard, IDocumentItem } from "@/types";
import useSettingStore from "@/stores/useSettingStore";
import { on, off } from "@/electron";

import styles from "./index.module.less";
import useRightSidebarStore from "@/stores/useRightSidebarStore";

interface IDocumentItemProps {
  itemId: number;
  parentId: number;
  isRoot?: boolean;
  onParentDeleteChild: (id: number) => Promise<void>;
  onParentAddChild: (
    id: number,
    targetId: number,
    position: EDragPosition,
  ) => Promise<void>;
  onParentMoveChild: (
    sourceId: number,
    targetId: number,
    position: EDragPosition,
  ) => Promise<void>;
  path: number[];
  parentChildren: number[];
}

const DocumentItem = (props: IDocumentItemProps) => {
  const {
    itemId,
    path,
    parentId,
    isRoot = false,
    onParentDeleteChild,
    onParentAddChild,
    onParentMoveChild,
    parentChildren,
  } = props;

  const [item, setItem] = useState<IDocumentItem | null>(null);
  const [selectCardModalOpen, setSelectCardModalOpen] = useState(false);
  const [selectedCards, setSelectedCards] = useState<ICard[]>([]);
  const [selectArticleModalOpen, setSelectArticleModalOpen] = useState(false);
  const [selectDocumentItemModalOpen, setSelectDocumentItemModalOpen] =
    useState(false);
  const [allDocumentItems, setAllDocumentItems] = useState<IDocumentItem[]>([]);
  const [excludeDocumentItemIds, setExcludeDocumentItemIds] = useState<
    number[]
  >([]);
  const [folderOpen, setFolderOpen] = useState(() => {
    return path.length === 1;
  });
  const [isPresentation, setIsPresentation] = useState(false);
  const { modal } = App.useApp();

  const cards = useCardsManagementStore(useShallow((state) => state.cards));

  const articles = useArticleManagementStore(
    useShallow((state) => state.articles),
  );

  const activeDocumentItem = useDocumentsStore(
    useShallow((state) => state.activeDocumentItem),
  );

  useAsyncEffect(async () => {
    const item = await getDocumentItem(itemId);
    if (!item) {
      return;
    }
    setItem(item);
  }, [itemId]);

  // 监听 EditDoc 导致的 activeDocumentItem 变化，同步到当前 item
  useEffect(() => {
    if (activeDocumentItem?.id === itemId) {
      setItem(activeDocumentItem);
    }
  }, [itemId, activeDocumentItem]);

  useEffect(() => {
    if (!itemId) return;

    const handleDocumentItemWindowClosed = async (
      _e: any,
      data: { documentItemId: number; databaseName: string },
    ) => {
      if (data.documentItemId === itemId) {
        const updatedItem = await getDocumentItem(itemId);
        setItem(updatedItem);
      }
    };

    on("document-item-window-closed", handleDocumentItemWindowClosed);

    return () => {
      off("document-item-window-closed", handleDocumentItemWindowClosed);
    };
  }, [itemId]);

  const onDrop = useMemoizedFn(
    async (dragItem: IDragItem, dragPosition: EDragPosition) => {
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

      const newDragItem = await getDocumentItem(dragId);
      if (!newDragItem) return;

      // 更新 parents，先删除 dragItem 的 parentId
      // 如果是 inside，添加 itemId
      // 如果是 top 或者 bottom，添加 itemId 的 parentId
      const toUpdateItem = produce(newDragItem, (draft) => {
        if (!dragItem.isRoot) {
          // 是 root 的话，dragItem 的 parentId 是文档的 id，不是文档项的 id，因此不需要删除
          draft.parents = draft.parents.filter(
            (parentId) => parentId !== dragParentId,
          );
        }
        if (dragPosition === EDragPosition.Inside) {
          draft.parents.push(itemId);
        } else if (!isRoot) {
          // isRoot 的 parentId 是文档的 id，不是文档项的 id，因此不需要添加
          draft.parents.push(parentId);
        }
        // 去重
        draft.parents = Array.from(new Set(draft.parents));
      });
      const updatedDragItem = await updateDocumentItem(toUpdateItem);
      if (updatedDragItem.id === activeDocumentItem?.id) {
        useDocumentsStore.setState({
          activeDocumentItem: updatedDragItem,
        });
      }
    },
  );

  const onDragEnd = useMemoizedFn(async (dragItem: IDragItem) => {
    await onParentDeleteChild(dragItem.itemId);
  });

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
    children: item?.children || [],
    parentChildren,
  });

  const onAddNewDocumentItem = useMemoizedFn(async () => {
    if (!item) {
      return;
    }
    const createdDocumentItem = await createDocumentItem({
      ...DEFAULT_CREATE_DOCUMENT_ITEM,
      parents: [item.id],
    });
    const newItem = produce(item, (draft) => {
      draft.children.push(createdDocumentItem.id);
    });
    const updatedDoc = await updateDocumentItem(newItem);
    setItem(updatedDoc);
    if (item.id === activeDocumentItem?.id) {
      useDocumentsStore.setState({
        activeDocumentItem: updatedDoc,
      });
    }

    useDocumentsStore.setState({
      activeDocumentItem: createdDocumentItem,
    });
  });

  // 拖拽移动到当前 item 的上方或下方，或者移动到当前 item 的内部
  const onAddDocumentItemWithPosition = useMemoizedFn(
    async (id: number, targetId: number, position: EDragPosition) => {
      if (!item) {
        return;
      }
      let newItem: IDocumentItem;
      if (position === EDragPosition.Inside) {
        // 加入当前文档的开头
        newItem = produce(item, (draft) => {
          draft.children.unshift(id);
        });
        setFolderOpen(true);
      } else {
        const targetIndex = item.children.findIndex(
          (childId) => childId === targetId,
        );
        if (targetIndex === -1) {
          return;
        }
        const sliceIndex =
          position === EDragPosition.Top ? targetIndex : targetIndex + 1;
        newItem = produce(item, (draft) => {
          draft.children.splice(sliceIndex, 0, id);
        });
      }

      const updatedDoc = await updateDocumentItem(newItem);
      setItem(updatedDoc);
      if (item.id === activeDocumentItem?.id) {
        useDocumentsStore.setState({
          activeDocumentItem: updatedDoc,
        });
      }
    },
  );

  const onRemoveDocumentItem = useMemoizedFn(async (id: number) => {
    if (!item) {
      return;
    }
    const newItem = produce(item, (draft) => {
      draft.children = draft.children.filter((childId) => childId !== id);
    });
    const updatedDoc = await updateDocumentItem(newItem);
    setItem(updatedDoc);
    if (item.id === activeDocumentItem?.id) {
      useDocumentsStore.setState({
        activeDocumentItem: updatedDoc,
      });
    }
  });

  // 处理同级别子元素的移动，此时 position 绝对不可能是 EDragPosition.Inside
  const onMoveDocumentItem = useMemoizedFn(
    async (sourceId: number, targetId: number, position: EDragPosition) => {
      if (!item || position === EDragPosition.Inside) {
        return;
      }
      const sourceIndex = item.children.findIndex(
        (childId) => childId === sourceId,
      );
      const targetIndex = item.children.findIndex(
        (childId) => childId === targetId,
      );
      if (targetIndex === -1 || sourceIndex === -1) {
        message.error("未找到目标位置");
        return;
      }
      // 把 sourceIndex 的元素删除，然后插入到 targetIndex 的位置
      const newItem = produce(item, (draft) => {
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
      const updatedDoc = await updateDocumentItem(newItem);
      setItem(updatedDoc);
      if (item.id === activeDocumentItem?.id) {
        useDocumentsStore.setState({
          activeDocumentItem: updatedDoc,
        });
      }
    },
  );

  // 不是真的删除，只是从其父文档的 children 中删除，其内容还在数据库中，也能被搜索到
  const onClickDelete = useMemoizedFn(async () => {
    if (!item) return;
    const realTimeItem = await getDocumentItem(item.id);
    if (!realTimeItem) return;
    setItem(realTimeItem);
    modal.confirm({
      title: "是否删除文档",
      content:
        realTimeItem.children.length > 0
          ? "该文档下包含多篇子文档，是否删除"
          : "删除后无法恢复",
      onOk: async () => {
        await onParentDeleteChild(realTimeItem.id);
        // 更新 parents，将 parentId 从当前文档的 parents 中删除
        const toUpdateItem = produce(realTimeItem, (draft) => {
          draft.parents = draft.parents.filter((parent) => parent !== parentId);
          draft.parents = Array.from(new Set(draft.parents));
        });
        await updateDocumentItem(toUpdateItem);
        if (!activeDocumentItem || realTimeItem.id === activeDocumentItem.id) {
          useDocumentsStore.setState({
            activeDocumentItem: null,
          });
          return;
        }
        if (item.children.length === 0) return;

        // 判断所有的孩子以及子孙是否包含 activeDocumentItem，如果包含需要将 activeDocumentItem 设置为 null
        const activeDocumentItemId = activeDocumentItem.id;
        const isChildOf = await isDocumentItemChildOf(
          activeDocumentItemId,
          realTimeItem.id,
        );
        if (isChildOf) {
          useDocumentsStore.setState({
            activeDocumentItem: null,
          });
        }
      },
      okText: "删除",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
    });
  });

  const onSelectCardFinish = useMemoizedFn(async (selectedCards: ICard[]) => {
    if (selectedCards.length === 0) {
      message.warning("请选择卡片");
      return;
    }
    if (!item) {
      return;
    }
    const createdDocumentItem = await createDocumentItem({
      ...DEFAULT_CREATE_DOCUMENT_ITEM,
      isCard: true,
      cardId: selectedCards[0].id,
      content: selectedCards[0].content,
      parents: [item.id],
    });
    const newItem = produce(item, (draft) => {
      draft.children.push(createdDocumentItem.id);
    });
    const updatedDoc = await updateDocumentItem(newItem);
    setItem(updatedDoc);
    if (item.id === activeDocumentItem?.id) {
      useDocumentsStore.setState({
        activeDocumentItem: updatedDoc,
      });
    }
    setFolderOpen(true);
    setSelectCardModalOpen(false);

    const cardItem = await getDocumentItem(createdDocumentItem.id);
    if (!cardItem) return;
    useDocumentsStore.setState({
      activeDocumentItem: cardItem,
    });
  });

  const onSelectArticleFinish = useMemoizedFn(
    async (selectedArticles: IArticle[]) => {
      if (selectedArticles.length === 0) {
        message.warning("请选择文章");
        return;
      }
      if (!item) {
        return;
      }
      const createdDocumentItem = await createDocumentItem({
        ...DEFAULT_CREATE_DOCUMENT_ITEM,
        isArticle: true,
        articleId: selectedArticles[0].id,
        title: selectedArticles[0].title,
        content: selectedArticles[0].content,
        parents: [item.id],
      });
      const newItem = produce(item, (draft) => {
        draft.children.push(createdDocumentItem.id);
      });
      const updatedDoc = await updateDocumentItem(newItem);
      setItem(updatedDoc);
      if (item.id === activeDocumentItem?.id) {
        useDocumentsStore.setState({
          activeDocumentItem: updatedDoc,
        });
      }
      setFolderOpen(true);
      setSelectArticleModalOpen(false);

      const articleItem = await getDocumentItem(createdDocumentItem.id);
      if (!articleItem) return;
      useDocumentsStore.setState({
        activeDocumentItem: articleItem,
      });
    },
  );

  const onSelectArticleCancel = useMemoizedFn(() => {
    setSelectArticleModalOpen(false);
  });

  const onSelectDocumentItemFinish = useMemoizedFn(
    async (selectedDocumentItems: IDocumentItem[]) => {
      if (selectedDocumentItems.length === 0) {
        message.warning("请选择文档");
        return;
      }
      if (!item) {
        return;
      }
      // 如果选择的 selectedDocumentItems 已经在 children，给出提示并返回
      const isChildren = selectedDocumentItems.some((selectedDocumentItem) =>
        item.children.includes(selectedDocumentItem.id),
      );
      if (isChildren) {
        message.warning("选择的文档已经在当前文档的子文档中");
        return;
      }
      // 将他们添加到 children 中
      const newItem = produce(item, (draft) => {
        draft.children.push(...selectedDocumentItems.map((item) => item.id));
      });
      const updatedDoc = await updateDocumentItem(newItem);
      setItem(updatedDoc);
      if (item.id === activeDocumentItem?.id) {
        useDocumentsStore.setState({
          activeDocumentItem: updatedDoc,
        });
      }
      // 为这些项的 parents 添加此文档的 id
      const toUpdateItems = selectedDocumentItems.map((selectDocumentItem) => {
        return produce(selectDocumentItem, (draft) => {
          draft.parents.push(item.id);
          draft.parents = Array.from(new Set(draft.parents));
        });
      });

      setFolderOpen(true);
      setSelectDocumentItemModalOpen(false);

      const updatedItems = await Promise.all(
        toUpdateItems.map((toUpdateItem) => updateDocumentItem(toUpdateItem)),
      );
      // 设置 activeItem 为第一个
      const activeItem = updatedItems[0];
      if (!activeItem) return;
      useDocumentsStore.setState({
        activeDocumentItem: activeItem,
      });
    },
  );

  const excludeArticleIds = useMemo(() => {
    if (!activeDocumentItem?.articleId) {
      return [-1];
    }
    return [activeDocumentItem.articleId];
  }, [activeDocumentItem?.articleId]);

  const onSelectDocumentItemCancel = useMemoizedFn(() => {
    setSelectDocumentItemModalOpen(false);
  });

  // Create menu items for the more dropdown
  const moreMenuItems: MenuProps["items"] = useMemo(
    () => [
      {
        key: "delete",
        label: "删除文档",
      },
      {
        key: "presentation",
        label: "演示模式",
      },
      {
        key: "open-in-new-window",
        label: "窗口打开",
      },
      {
        key: "open-in-right-sidebar",
        label: "右侧打开",
      },
    ],
    [],
  );

  const handleMoreMenuClick: MenuProps["onClick"] = useMemoizedFn(
    async ({ key }) => {
      if (key === "delete") {
        await onClickDelete();
      } else if (key === "presentation") {
        setIsPresentation(true);
      } else if (key === "open-in-new-window") {
        const databaseName = useSettingStore.getState().setting.database.active;
        openDocumentItemInNewWindow(databaseName, itemId);
      } else if (key === "open-in-right-sidebar") {
        const addTab = useRightSidebarStore.getState().addTab;
        addTab({
          type: "document-item",
          id: String(itemId),
          title: item?.title || "知识库",
        });
      }
    },
  );

  const addMenuItems: MenuProps["items"] = useMemo(
    () => [
      {
        key: "add-document",
        label: "添加文档",
      },
      {
        key: "associate-card",
        label: "关联卡片",
      },
      {
        key: "associate-article",
        label: "关联文章",
      },
      {
        key: "associate-document",
        label: "关联文档",
      },
    ],
    [],
  );

  const handleAddMenuClick: MenuProps["onClick"] = useMemoizedFn(
    async ({ key }) => {
      if (!item) return;

      if (key === "add-document") {
        await onAddNewDocumentItem();
      } else if (key === "associate-card") {
        setSelectCardModalOpen(true);
      } else if (key === "associate-article") {
        setSelectArticleModalOpen(true);
      } else if (key === "associate-document") {
        try {
          const [allItems, allParents] = await Promise.all([
            getAllDocumentItems(),
            getDocumentItemAllParents(item.id),
          ]);
          setAllDocumentItems(allItems);
          setExcludeDocumentItemIds([...allParents, item.id, ...item.children]);
          setSelectDocumentItemModalOpen(true);
        } catch (e) {
          console.error(e);
          message.error("获取文档列表失败" + e);
        }
      }
    },
  );

  if (!item) {
    return null;
  }

  return (
    <div
      ref={drag}
      className={classnames(styles.item, {
        [styles.dragging]: isDragging,
      })}
    >
      <div
        ref={(node) => {
          dropContainerRef.current = node;
          drop(node);
        }}
        className={classnames(styles.header, {
          [styles.active]: activeDocumentItem?.id === item.id,
          [styles.top]: isOver && canDrop && dragPosition === EDragPosition.Top,
          [styles.bottom]:
            isOver && canDrop && dragPosition === EDragPosition.Bottom,
          [styles.inside]:
            isOver && canDrop && dragPosition === EDragPosition.Inside,
        })}
        onClick={async () => {
          // 防止一个 Document 里面有多个相同的 DocumentItem
          // 其它 DocumentItem 进行了更新，但是当前 DocumentItem 没有更新
          // 导致更新了错误的数据，因此在编辑之前需要重新获取一次
          const realTimeItem = await getDocumentItem(item.id);
          if (!realTimeItem) return;
          setItem(realTimeItem);
          useDocumentsStore.setState({
            activeDocumentItem: realTimeItem,
          });
        }}
      >
        <div className={styles.titleContainer}>
          <Tooltip
            title={
              item.children.length > 0
                ? folderOpen
                  ? "收起"
                  : "展开"
                : undefined
            }
          >
            <div
              className={classnames(styles.icon, {
                [styles.hoverable]: item.children.length > 0,
              })}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (item.children.length === 0) return;
                setFolderOpen(!folderOpen);
              }}
            >
              {item.children.length > 0 ? (
                <FolderOpenTwoTone />
              ) : (
                <FileOutlined />
              )}
            </div>
          </Tooltip>
          <div className={styles.title}>{item.title}</div>
        </div>
        <div
          className={styles.icons}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <Dropdown
            menu={{
              items: moreMenuItems,
              onClick: handleMoreMenuClick,
            }}
            trigger={["hover"]}
          >
            <div className={styles.icon}>
              <MoreOutlined />
            </div>
          </Dropdown>
          <Dropdown
            menu={{
              items: addMenuItems,
              onClick: handleAddMenuClick,
            }}
            trigger={["hover"]}
          >
            <div
              className={styles.icon}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <PlusOutlined />
            </div>
          </Dropdown>
        </div>
      </div>
      <div
        className={classnames(styles.gridContainer, {
          [styles.hide]: item.children.length === 0 || !folderOpen,
        })}
      >
        <div className={styles.children}>
          {item.children.map((id, index) => (
            <DocumentItem
              key={id}
              itemId={id}
              parentId={item.id}
              onParentDeleteChild={onRemoveDocumentItem}
              onParentAddChild={onAddDocumentItemWithPosition}
              onParentMoveChild={onMoveDocumentItem}
              path={[...path, index]}
              parentChildren={item.children}
            />
          ))}
        </div>
      </div>
      <SelectCardModal
        title={"选择关联卡片"}
        selectedCards={selectedCards}
        onChange={setSelectedCards}
        open={selectCardModalOpen}
        allCards={cards}
        onCancel={() => {
          setSelectCardModalOpen(false);
        }}
        onOk={onSelectCardFinish}
        excludeCardIds={[activeDocumentItem?.cardId || -1]}
      />
      <SelectModal
        title={"选择关联文章"}
        open={selectArticleModalOpen}
        allItems={articles}
        excludeIds={excludeArticleIds}
        onCancel={onSelectArticleCancel}
        onOk={onSelectArticleFinish}
      />
      <SelectModal
        title={"选择关联文档"}
        open={selectDocumentItemModalOpen}
        allItems={allDocumentItems}
        excludeIds={excludeDocumentItemIds}
        onCancel={onSelectDocumentItemCancel}
        onOk={onSelectDocumentItemFinish}
      />

      {isPresentation && item && (
        <PresentationMode
          content={item.content}
          onExit={() => {
            setIsPresentation(false);
          }}
        />
      )}
    </div>
  );
};

export default DocumentItem;
