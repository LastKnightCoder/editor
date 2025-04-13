import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { App, Dropdown, MenuProps, message, Tooltip } from "antd";
import {
  FileOutlined,
  MoreOutlined,
  PlusOutlined,
  FolderOpenTwoTone,
} from "@ant-design/icons";
import {
  useAsyncEffect,
  useCreation,
  useLocalStorageState,
  useMemoizedFn,
} from "ahooks";
import { produce } from "immer";
import classnames from "classnames";

import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import useDragAndDrop, {
  EDragPosition,
  IDragItem,
} from "@/hooks/useDragAndDrop.ts";
import {
  defaultDocumentItemEventBus,
  downloadMarkdown,
  getMarkdown,
} from "@/utils";

import {
  getDocumentItem,
  getDocumentItemAllParents,
  isDocumentItemChildOf,
  updateDocumentItem,
  openDocumentItemInNewWindow,
  removeChildDocumentItem,
  addChildDocumentItem,
  addRefChildDocumentItem,
} from "@/commands";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import PresentationMode from "@/components/PresentationMode";
import { DEFAULT_CREATE_DOCUMENT_ITEM } from "@/constants";
import {
  IArticle,
  ICard,
  IDocumentItem,
  IndexType,
  SearchResult,
} from "@/types";
import { IExtension } from "@/components/Editor";
import useSettingStore from "@/stores/useSettingStore";

import styles from "./index.module.less";
import useRightSidebarStore from "@/stores/useRightSidebarStore";

interface IDocumentItemProps {
  documentId: number;
  itemId: number;
  parentId: number;
  isRoot?: boolean;
  onParentDeleteChild: (
    id: number,
    notDelete?: boolean,
  ) => Promise<IDocumentItem | null>;
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
  onOpenChange?: (open: boolean) => void;
  path: number[];
  parentChildren: number[];
  cards: ICard[];
  articles: IArticle[];
  documentItems: IDocumentItem[];
}

const DocumentItem = (props: IDocumentItemProps) => {
  const {
    documentId,
    itemId,
    path,
    parentId,
    isRoot = false,
    onParentDeleteChild,
    onParentAddChild,
    onParentMoveChild,
    parentChildren,
    cards,
    articles,
    documentItems,
    onOpenChange,
  } = props;

  const [item, setItem] = useState<IDocumentItem | null>(null);
  const [selectCardModalOpen, setSelectCardModalOpen] = useState(false);
  const [selectArticleModalOpen, setSelectArticleModalOpen] = useState(false);
  const [selectDocumentItemModalOpen, setSelectDocumentItemModalOpen] =
    useState(false);
  const [excludeDocumentItemIds, setExcludeDocumentItemIds] = useState<
    number[]
  >([]);
  const databaseName = useSettingStore.getState().setting.database.active;
  const [folderOpen, setFolderOpen] = useLocalStorageState(
    `document-item-${databaseName}-${itemId}`,
    {
      defaultValue: path.length === 1,
    },
  );
  const [isPresentation, setIsPresentation] = useState(false);
  const [extensions, setExtensions] = useState<IExtension[]>([]);
  const { modal } = App.useApp();
  const documentItemEventBus = useCreation(
    () => defaultDocumentItemEventBus.createEditor(),
    [],
  );

  const activeDocumentItemId = useDocumentsStore(
    useShallow((state) => state.activeDocumentItemId),
  );

  useEffect(() => {
    if (activeDocumentItemId === itemId) {
      setFolderOpen(true);
      onOpenChange?.(true);
    }
  }, [activeDocumentItemId, itemId, onOpenChange, setFolderOpen]);

  const onChildOpenChange = useMemoizedFn((open: boolean) => {
    if (open) {
      setFolderOpen(true);
    }
  });

  useAsyncEffect(async () => {
    const item = await getDocumentItem(itemId);
    if (!item) {
      return;
    }
    setItem(item);
  }, [itemId]);

  useEffect(() => {
    const unsubscribe = documentItemEventBus.subscribeToDocumentItemWithId(
      "document-item:updated",
      itemId,
      (data) => {
        setItem(data.documentItem);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [itemId, documentItemEventBus]);

  useEffect(() => {
    import("@/editor-extensions").then(
      ({
        cardLinkExtension,
        fileAttachmentExtension,
        questionCardExtension,
      }) => {
        setExtensions([
          cardLinkExtension,
          fileAttachmentExtension,
          questionCardExtension,
        ]);
      },
    );
  }, []);

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
      if (!updatedDragItem) return;
      defaultDocumentItemEventBus
        .createEditor()
        .publishDocumentItemEvent("document-item:updated", updatedDragItem);
    },
  );

  const onDragEnd = useMemoizedFn(async (dragItem: IDragItem) => {
    await onParentDeleteChild(dragItem.itemId, true);
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
    const res = await addChildDocumentItem(
      item.id,
      DEFAULT_CREATE_DOCUMENT_ITEM,
    );
    if (!res) return;
    const [parentDocumentItem, createdDocumentItem] = res;
    if (!parentDocumentItem || !createdDocumentItem) return;
    setItem(parentDocumentItem);
    documentItemEventBus.publishDocumentItemEvent(
      "document-item:updated",
      parentDocumentItem,
    );

    // useDocumentsStore.setState({
    //   activeDocumentItemId: createdDocumentItem.id,
    // });
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
          draft.children.push(id);
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
      if (!updatedDoc) return;
      setItem(updatedDoc);
      documentItemEventBus.publishDocumentItemEvent(
        "document-item:updated",
        updatedDoc,
      );
    },
  );

  const onRemoveDocumentItem = useMemoizedFn(
    async (id: number, notDelete?: boolean) => {
      if (!item) {
        return null;
      }
      const res = await removeChildDocumentItem(
        documentId,
        item.id,
        id,
        notDelete,
      );
      if (!res) return null;
      const [parentDocumentItem, removedDocumentItem] = res;
      if (!parentDocumentItem || !removedDocumentItem) return null;
      setItem(parentDocumentItem);
      documentItemEventBus.publishDocumentItemEvent(
        "document-item:updated",
        parentDocumentItem,
      );
      return removedDocumentItem;
    },
  );

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
      if (!updatedDoc) return;
      setItem(updatedDoc);
      documentItemEventBus.publishDocumentItemEvent(
        "document-item:updated",
        updatedDoc,
      );
    },
  );

  const onClickDelete = useMemoizedFn(async () => {
    if (!item) return;
    modal.confirm({
      title: "是否删除文档",
      content:
        item.children.length > 0
          ? "该文档下包含多篇子文档，是否删除"
          : "删除后无法恢复",
      onOk: async () => {
        await onParentDeleteChild(item.id);

        const activeDocumentItemId =
          useDocumentsStore.getState().activeDocumentItemId;
        if (!activeDocumentItemId || activeDocumentItemId === item.id) {
          useDocumentsStore.setState({
            activeDocumentItemId: null,
          });
          return;
        }

        if (item.children.length === 0) return;

        // 判断所有的孩子以及子孙是否包含 activeDocumentItem，如果包含需要将 activeDocumentItem 设置为 null
        const isChildOf = await isDocumentItemChildOf(
          activeDocumentItemId,
          item.id,
        );
        if (isChildOf) {
          useDocumentsStore.setState({
            activeDocumentItemId: null,
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
    const res = await addChildDocumentItem(item.id, {
      ...DEFAULT_CREATE_DOCUMENT_ITEM,
      isCard: true,
      cardId: selectedCards[0].id,
      content: selectedCards[0].content,
    });
    if (!res) return;
    const [parentDocumentItem, createdDocumentItem] = res;
    if (!parentDocumentItem || !createdDocumentItem) return;
    setItem(parentDocumentItem);
    documentItemEventBus.publishDocumentItemEvent(
      "document-item:updated",
      parentDocumentItem,
    );

    setFolderOpen(true);
    setSelectCardModalOpen(false);

    const cardItem = await getDocumentItem(createdDocumentItem.id);
    if (!cardItem) return;
    useDocumentsStore.setState({
      activeDocumentItemId: cardItem.id,
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
      const res = await addChildDocumentItem(item.id, {
        ...DEFAULT_CREATE_DOCUMENT_ITEM,
        isArticle: true,
        articleId: selectedArticles[0].id,
        title: selectedArticles[0].title,
        content: selectedArticles[0].content,
      });
      if (!res) return;
      const [parentDocumentItem, createdDocumentItem] = res;
      if (!parentDocumentItem || !createdDocumentItem) return;
      setItem(parentDocumentItem);
      documentItemEventBus.publishDocumentItemEvent(
        "document-item:updated",
        parentDocumentItem,
      );
      setFolderOpen(true);
      setSelectArticleModalOpen(false);

      const articleItem = await getDocumentItem(createdDocumentItem.id);
      if (!articleItem) return;
      useDocumentsStore.setState({
        activeDocumentItemId: articleItem.id,
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

      let updatedParentDocumentItem: IDocumentItem;
      selectedDocumentItems.forEach(async (selectedDocumentItem) => {
        const res = await addRefChildDocumentItem(
          item.id,
          selectedDocumentItem.id,
        );
        if (!res) return;
        const [parentDocumentItem, createdDocumentItem] = res;
        if (!parentDocumentItem || !createdDocumentItem) return;
        defaultDocumentItemEventBus
          .createEditor()
          .publishDocumentItemEvent(
            "document-item:updated",
            createdDocumentItem,
          );
        updatedParentDocumentItem = parentDocumentItem;

        setItem(updatedParentDocumentItem);
        documentItemEventBus.publishDocumentItemEvent(
          "document-item:updated",
          updatedParentDocumentItem,
        );
      });

      setFolderOpen(true);
      setSelectDocumentItemModalOpen(false);

      // 设置 activeItem 为第一个
      const activeItem = selectedDocumentItems[0];
      if (!activeItem) return;
      useDocumentsStore.setState({
        activeDocumentItemId: activeItem.id,
      });
    },
  );

  const excludeArticleIds = useMemo(() => {
    return [-1];
  }, []);

  const excludeCardIds = useMemo(() => {
    return [-1];
  }, []);

  const initialCardContents = useMemo(() => {
    return cards.map((card) => ({
      id: card.id,
      contentId: card.contentId,
      type: "card" as IndexType,
      title: "",
      content: card.content,
      source: "fts" as "fts" | "vec-document",
      updateTime: card.update_time,
    }));
  }, [cards]);

  const initialArticleContents = useMemo(() => {
    return articles.map((article) => ({
      id: article.id,
      contentId: article.contentId,
      type: "article" as IndexType,
      title: article.title,
      content: article.content,
      source: "fts" as "fts" | "vec-document",
      updateTime: article.update_time,
    }));
  }, [articles]);

  const initialDocumentItemContents = useMemo(() => {
    return documentItems.map((documentItem) => ({
      id: documentItem.id,
      contentId: documentItem.contentId,
      type: "document-item" as IndexType,
      title: documentItem.title,
      content: documentItem.content,
      source: "fts" as "fts" | "vec-document",
      updateTime: documentItem.updateTime,
    }));
  }, [documentItems]);

  const handleCardSelect = useMemoizedFn(
    (selectedResults: SearchResult | SearchResult[]) => {
      const results = Array.isArray(selectedResults)
        ? selectedResults
        : [selectedResults];
      const selectedCardIds = results.map((result) => result.id);
      const newSelectedCards = selectedCardIds
        .map((id) => cards.find((card) => card.id === id))
        .filter((card): card is ICard => !!card);

      onSelectCardFinish(newSelectedCards);
    },
  );

  const handleArticleSelect = useMemoizedFn(
    (selectedResults: SearchResult | SearchResult[]) => {
      const results = Array.isArray(selectedResults)
        ? selectedResults
        : [selectedResults];
      const selectedArticleIds = results.map((result) => result.id);
      const newSelectedArticles = selectedArticleIds
        .map((id) => articles.find((article) => article.id === id))
        .filter((article): article is IArticle => !!article);

      onSelectArticleFinish(newSelectedArticles);
    },
  );

  const handleDocumentItemSelect = useMemoizedFn(
    (selectedResults: SearchResult | SearchResult[]) => {
      const results = Array.isArray(selectedResults)
        ? selectedResults
        : [selectedResults];
      const selectedDocumentItemIds = results.map((result) => result.id);
      const newSelectedDocumentItems = selectedDocumentItemIds
        .map((id) =>
          documentItems.find((documentItem) => documentItem.id === id),
        )
        .filter(
          (documentItem): documentItem is IDocumentItem => !!documentItem,
        );

      onSelectDocumentItemFinish(newSelectedDocumentItems);
    },
  );

  const onSelectDocumentItemCancel = useMemoizedFn(() => {
    setSelectDocumentItemModalOpen(false);
  });

  const moreMenuItems: MenuProps["items"] = useMemo(
    () => [
      {
        key: "delete",
        label: "删除文档",
      },
      {
        key: "export-markdown",
        label: "导出文档",
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
      } else if (key === "export-markdown") {
        if (!item) {
          return;
        }
        const markdown = getMarkdown(item.content);
        downloadMarkdown(markdown, item.title);
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
          const allParents = await getDocumentItemAllParents(item.id);
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
          [styles.active]: activeDocumentItemId === item.id,
          [styles.top]: isOver && canDrop && dragPosition === EDragPosition.Top,
          [styles.bottom]:
            isOver && canDrop && dragPosition === EDragPosition.Bottom,
          [styles.inside]:
            isOver && canDrop && dragPosition === EDragPosition.Inside,
        })}
        onClick={async () => {
          useDocumentsStore.setState({
            activeDocumentItemId: item.id,
          });
        }}
      >
        <Tooltip title={item.title} trigger={"hover"}>
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
        </Tooltip>
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
              documentId={documentId}
              itemId={id}
              parentId={item.id}
              onParentDeleteChild={onRemoveDocumentItem}
              onParentAddChild={onAddDocumentItemWithPosition}
              onParentMoveChild={onMoveDocumentItem}
              path={[...path, index]}
              parentChildren={item.children}
              cards={cards}
              articles={articles}
              documentItems={documentItems}
              onOpenChange={onChildOpenChange}
            />
          ))}
        </div>
      </div>
      <ContentSelectorModal
        title={"选择关联卡片"}
        open={selectCardModalOpen}
        onCancel={() => {
          setSelectCardModalOpen(false);
        }}
        onSelect={handleCardSelect}
        contentType="card"
        multiple={false}
        excludeIds={excludeCardIds}
        initialContents={initialCardContents}
        extensions={extensions}
      />
      <ContentSelectorModal
        title={"选择关联文章"}
        open={selectArticleModalOpen}
        onCancel={onSelectArticleCancel}
        onSelect={handleArticleSelect}
        contentType="article"
        multiple={false}
        excludeIds={excludeArticleIds}
        extensions={extensions}
        initialContents={initialArticleContents}
      />
      <ContentSelectorModal
        title={"选择关联文档"}
        open={selectDocumentItemModalOpen}
        onCancel={onSelectDocumentItemCancel}
        onSelect={handleDocumentItemSelect}
        contentType="document-item"
        multiple={false}
        excludeIds={excludeDocumentItemIds}
        extensions={extensions}
        initialContents={initialDocumentItemContents}
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
