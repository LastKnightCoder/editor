import { memo, useEffect, useMemo, useState } from "react";
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
import classnames from "classnames";

import useDragAndDrop, {
  EDragPosition,
  IDragItem,
} from "@/hooks/useDragAndDrop.ts";
import {
  defaultDocumentItemEventBus,
  downloadMarkdown,
  getMarkdown,
  copyMarkdownToClipboard,
  copyWechatHtmlToClipboard,
} from "@/utils";

import {
  getDocumentItem,
  getDocumentItemsByIds,
  getDocumentItemAllParents,
  isDocumentItemChildOf,
  openDocumentItemInNewWindow,
  removeChildDocumentItem,
  addChildDocumentItem,
  addRefChildDocumentItem,
  moveDocumentTreeItem,
} from "@/commands";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import PresentationMode from "@/components/PresentationMode";
import ContentExportModal from "@/components/ContentExportModal";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";
import { DEFAULT_CREATE_DOCUMENT_ITEM } from "@/constants";
import { useThemeColors } from "@/hooks";
import {
  IArticle,
  ICard,
  IDocumentItem,
  IndexType,
  SearchResult,
} from "@/types";
import useSettingStore from "@/stores/useSettingStore";
import useFlashcardCreation from "@/hooks/useFlashcardCreation";
import DeckSelectorModal from "@/components/DeckSelectorModal";
import FlashcardGenerationModal from "@/components/FlashcardGenerationModal";
import GeneratedFlashcardEditModal from "@/components/GeneratedFlashcardEditModal";
import FlashcardEditor from "@/pages/FlashcardCenter/FlashcardEditor";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";
import styles from "./index.module.less";
import { useDocumentContext } from "../../DocumentContext";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";

import { createDocumentCardListExtension } from "@/editor-extensions";

interface IDocumentItemProps {
  documentId: number;
  itemId: number;
  parentId: number;
  isRoot?: boolean;
  onParentDeleteChild: (
    id: number,
    notDelete?: boolean,
  ) => Promise<IDocumentItem | null>;
  refreshDocument?: () => void;
  onOpenChange?: (open: boolean) => void;
  path: number[];
  parentChildren: number[];
  cards: ICard[];
  articles: IArticle[];
  documentItems: IDocumentItem[];
}

const DocumentItem = memo((props: IDocumentItemProps) => {
  const {
    documentId,
    itemId,
    path,
    parentId,
    isRoot = false,
    onParentDeleteChild,
    refreshDocument,
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
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [epubExportModalOpen, setEpubExportModalOpen] = useState(false);
  const [pdfExportModalOpen, setPdfExportModalOpen] = useState(false);
  const dynamicExtensions = useDynamicExtensionsStore(
    (state) => state.extensions,
  );
  const { modal } = App.useApp();
  const darkMode = useSettingStore((state) => state.setting.darkMode);
  const documentItemEventBus = useCreation(
    () => defaultDocumentItemEventBus.createEditor(),
    [],
  );

  const extensions = useCreation(() => {
    return [...dynamicExtensions, createDocumentCardListExtension(itemId)];
  }, [itemId, dynamicExtensions]);

  const navigateTo = useTabStore((state) => state.navigateTo);
  const { hoverClass, activeClass } = useThemeColors();

  const { itemId: activeDocumentItemId } = useDocumentContext();

  // 闪卡生成
  const flashcard = useFlashcardCreation({
    getContent: () => item?.content || [],
    getReference: () => ({
      refType: "content",
      contentId: item?.contentId || 0,
      title: item?.title || "文档参考",
    }),
  });

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

  const onDrop = useMemoizedFn(
    async (dragItem: IDragItem, dragPosition: EDragPosition) => {
      const cleanDragItem: IDragItem = {
        itemId: dragItem.itemId,
        parentId: dragItem.parentId,
        isRoot: dragItem.isRoot,
        path: dragItem.path,
        children: dragItem.children,
        parentChildren: dragItem.parentChildren,
      };
      const result = await moveDocumentTreeItem(documentId, {
        dragItem: cleanDragItem,
        dropTargetId: itemId,
        dropTargetParentId: parentId,
        dropTargetIsRoot: isRoot,
        dragPosition,
      });
      if (!result) {
        message.warning("移动失败，目标位置可能已变化");
        return;
      }
      if (
        dragItem.isRoot ||
        (dragPosition !== EDragPosition.Inside && isRoot)
      ) {
        refreshDocument?.();
      }
      const updatedDocumentItems = await getDocumentItemsByIds([
        ...new Set(result.refreshItemIds),
      ]);
      updatedDocumentItems.forEach((updatedDocumentItem) => {
        if (!updatedDocumentItem) return;
        defaultDocumentItemEventBus
          .createEditor()
          .publishDocumentItemEvent(
            "document-item:updated",
            updatedDocumentItem,
          );
      });
    },
  );

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

        if (!activeDocumentItemId || activeDocumentItemId === item.id) {
          navigateTo(TabType.DocumentDetail, {
            id: documentId,
            itemId: undefined,
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
          navigateTo(TabType.DocumentDetail, {
            id: documentId,
            itemId: undefined,
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
    navigateTo(
      TabType.DocumentDetail,
      { id: documentId, itemId: cardItem.id },
      `知识库 - ${cardItem.title || `#${cardItem.id}`}`,
    );
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
      navigateTo(
        TabType.DocumentDetail,
        {
          id: documentId,
          itemId: articleItem.id,
        },
        `知识库 - ${articleItem.title || `#${articleItem.id}`}`,
      );
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

      let updatedParentDocumentItem: IDocumentItem | null = null;
      for (const selectedDocumentItem of selectedDocumentItems) {
        const res = await addRefChildDocumentItem(
          item.id,
          selectedDocumentItem.id,
        );
        if (!res) continue;
        const [parentDocumentItem, createdDocumentItem] = res;
        if (!parentDocumentItem || !createdDocumentItem) continue;
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
      }

      setFolderOpen(true);
      setSelectDocumentItemModalOpen(false);

      // 设置 activeItem 为第一个
      const activeItem = selectedDocumentItems[0];
      if (!activeItem) return;
      navigateTo(
        TabType.DocumentDetail,
        {
          id: documentId,
          itemId: activeItem.id,
        },
        `知识库 - ${activeItem.title || `#${activeItem.id}`}`,
      );
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
        key: "copy",
        label: "复制文档",
        children: [
          {
            key: "copy-markdown",
            label: "Markdown",
          },
          {
            key: "copy-wechat",
            label: "微信公众号",
          },
        ],
      },
      {
        key: "export",
        label: "导出文档",
        children: [
          {
            key: "export-markdown",
            label: "Markdown",
          },
          {
            key: "export-image",
            label: "图片",
          },
          {
            key: "export-epub",
            label: "EPUB",
          },
          {
            key: "export-pdf",
            label: "PDF",
          },
        ],
      },
      {
        key: "presentation",
        label: "演示模式",
      },
      {
        key: "flashcard",
        label: "制作闪卡",
        children: [
          { key: "flashcard-manual", label: "手动制卡" },
          { key: "flashcard-ai", label: "AI 制卡" },
        ],
      },
      {
        key: "open-in-new-window",
        label: "窗口打开",
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
      } else if (key === "copy-markdown") {
        if (!item) return;
        await copyMarkdownToClipboard(item.content, message);
      } else if (key === "copy-wechat") {
        if (!item) return;
        await copyWechatHtmlToClipboard(item.content, message);
      } else if (key === "export-image") {
        setExportModalOpen(true);
      } else if (key === "export-epub") {
        setEpubExportModalOpen(true);
      } else if (key === "export-pdf") {
        setPdfExportModalOpen(true);
      } else if (key === "presentation") {
        setIsPresentation(true);
      } else if (key === "open-in-new-window") {
        const databaseName = useSettingStore.getState().setting.database.active;
        openDocumentItemInNewWindow(databaseName, itemId);
      } else if (key === "flashcard-manual") {
        flashcard.openManualFlashcard();
      } else if (key === "flashcard-ai") {
        flashcard.openAiFlashcard();
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
      ref={(node) => {
        drag(node);
      }}
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
          [activeClass]: activeDocumentItemId === item.id,
          [hoverClass]: activeDocumentItemId !== item.id,
          [styles.top]: isOver && canDrop && dragPosition === EDragPosition.Top,
          [styles.bottom]:
            isOver && canDrop && dragPosition === EDragPosition.Bottom,
          [styles.inside]:
            isOver && canDrop && dragPosition === EDragPosition.Inside,
        })}
        onClick={async () => {
          navigateTo(
            TabType.DocumentDetail,
            {
              id: documentId,
              itemId: item.id,
            },
            `知识库 - ${item.title || `#${item.id}`}`,
          );
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
              refreshDocument={refreshDocument}
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
      {selectCardModalOpen && (
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
      )}
      {selectArticleModalOpen && (
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
      )}
      {selectDocumentItemModalOpen && (
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
      )}

      {isPresentation && item && (
        <PresentationMode
          content={item.content}
          onExit={() => {
            setIsPresentation(false);
          }}
        />
      )}

      {exportModalOpen && (
        <ContentExportModal
          open={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          content={item?.content || []}
          title={item?.title || "文档"}
        />
      )}
      {epubExportModalOpen && (
        <EpubExportModal
          open={epubExportModalOpen}
          onClose={() => setEpubExportModalOpen(false)}
          content={item?.content || []}
          title={item?.title || "文档"}
        />
      )}
      {pdfExportModalOpen && (
        <PdfExportModal
          visible={pdfExportModalOpen}
          onClose={() => setPdfExportModalOpen(false)}
          content={item?.content || []}
          title={item?.title || "文档"}
        />
      )}

      {/* 卡组选择弹窗 */}
      {flashcard.deckSelectorOpen && (
        <DeckSelectorModal
          open={flashcard.deckSelectorOpen}
          onCancel={flashcard.closeDeckSelector}
          onSelect={flashcard.handleDeckSelect}
          title={
            flashcard.deckSelectorMode === "manual"
              ? "选择卡组 - 手动制卡"
              : "选择卡组 - AI 制卡"
          }
        />
      )}

      {/* 手动制卡编辑器 */}
      {flashcard.flashcardEditorOpen && flashcard.selectedDeck && (
        <FlashcardEditor
          open={flashcard.flashcardEditorOpen}
          mode="create"
          activeDeckId={flashcard.selectedDeck.id}
          onClose={flashcard.closeFlashcardEditor}
          isDark={darkMode}
          initialReferences={[flashcard.getReference()]}
        />
      )}

      {/* AI 生成闪卡弹窗 */}
      {flashcard.aiGenerationModalOpen && (
        <FlashcardGenerationModal
          open={flashcard.aiGenerationModalOpen}
          onCancel={flashcard.handleCancelAiGeneration}
          isGenerating={flashcard.isGenerating}
          isPending={flashcard.isGenerationPending}
          error={flashcard.generationError}
          generatedCards={flashcard.generatedCards}
          selectedDeck={flashcard.selectedDeck}
          onToggleCard={flashcard.toggleCardSelection}
          onSelectAll={flashcard.selectAll}
          onDeselectAll={flashcard.deselectAll}
          onConfirm={flashcard.handleConfirmAiGeneration}
          onChangeDeck={flashcard.changeDeck}
          onEditCard={flashcard.handleEditGeneratedCard}
        />
      )}

      {/* 编辑 AI 生成的闪卡弹窗 */}
      {flashcard.generatedCardEditModalOpen && (
        <GeneratedFlashcardEditModal
          open={flashcard.generatedCardEditModalOpen}
          card={flashcard.editingGeneratedCard}
          onSave={flashcard.handleSaveGeneratedCard}
          onCancel={flashcard.closeGeneratedCardEditModal}
          isDark={darkMode}
        />
      )}
    </div>
  );
});

export default DocumentItem;
