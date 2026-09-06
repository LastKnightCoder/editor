import React, { MouseEvent, useMemo, useRef, memo, useState } from "react";
import classnames from "classnames";
import { IoResizeOutline } from "react-icons/io5";
import { MdMoreHoriz } from "react-icons/md";
import { AiFillPushpin } from "react-icons/ai";
import { Dropdown, MenuProps, Tooltip } from "antd";
import { useMemoizedFn } from "ahooks";
import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import { useShallow } from "zustand/react/shallow";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";

import Tags from "@/components/Tags";
import ErrorBoundary from "@/components/ErrorBoundary";
import ContentExportModal from "@/components/ContentExportModal";
import EpubExportModal from "@/components/EpubExportModal";
import { PdfExportModal } from "@/components/PdfExportModal";
import { formatDate, getEditorText, getMarkdown, downloadMarkdown } from "@/utils";
import { openCardInNewWindow } from "@/commands";
import useSettingStore from "@/stores/useSettingStore.ts";
import { ECardCategory, ICard } from "@/types";
import { cardCategoryName } from "@/constants";
import useEditContent from "@/hooks/useEditContent";
import useChatContentDrag from "@/hooks/useChatContentDrag";
import { useThemeColors } from "@/hooks";

interface CardItemProps {
  card: ICard;
  onPresentationMode: (card: ICard) => void;
  onCardClick?: (card: ICard) => void;
  onDeleteCard?: (cardId: number) => Promise<void>;
  onUpdateCardCategory?: (card: ICard, category: ECardCategory) => Promise<void>;
  onToggleCardTop?: (cardId: number) => Promise<void>;
  className?: string;
  style?: React.CSSProperties;
}

const CardItem = memo(
  (props: CardItemProps) => {
    const {
      card,
      className,
      style,
      onPresentationMode,
      onCardClick,
      onDeleteCard,
      onUpdateCardCategory,
      onToggleCardTop,
    } = props;

    const navigateTo = useTabStore(state => state.navigateTo);
    const dynamicExtensions = useDynamicExtensionsStore(state => state.extensions);
    const editorRef = useRef<EditorRef>(null);
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [epubExportModalOpen, setEpubExportModalOpen] = useState(false);
    const [pdfExportModalOpen, setPdfExportModalOpen] = useState(false);

    const databaseName = useSettingStore(useShallow(state => state.setting.database.active));

    const { content, tags, isTop, contentId } = card;
    const chatReference = useMemo(
      () => ({
        entityType: "card" as const,
        entityId: card.id,
        contentId,
        title: getEditorText(content, 40) || `卡片 #${card.id}`,
        previewText: getEditorText(content, 160),
      }),
      [card.id, content, contentId]
    );
    const { drag, isDragging } = useChatContentDrag(chatReference);

    const { hoverClass, cardBorderClass, cardBgClass, activeBgClass, focusBorderClass } =
      useThemeColors();

    useEditContent(contentId, content => {
      editorRef.current?.setEditorValue(content.slice(0, 3));
    });

    const onClick = useMemoizedFn(() => {
      if (onCardClick) {
        onCardClick(card);
      }
    });

    const stopPropagation = useMemoizedFn((e: MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
    });

    const handlePresentationMode = useMemoizedFn(() => {
      onPresentationMode(card);
    });

    const moreMenuItems: MenuProps["items"] = useMemo(() => {
      return [
        {
          key: "open-card-in-new-window",
          label: "窗口打开",
          onClick: () => openCardInNewWindow(databaseName, card.id),
        },
        {
          key: "toggle-top",
          label: isTop ? "取消置顶" : "设置置顶",
        },
        {
          key: "presentation-mode",
          label: "演示模式",
          onClick: handlePresentationMode,
        },
        {
          key: "delete-card",
          label: "删除卡片",
        },
        {
          key: "export-card",
          label: "导出卡片",
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
          key: "edit-category",
          label: "编辑分类",
          children: Object.keys(cardCategoryName).map(key => ({
            label: cardCategoryName[key as ECardCategory],
            key: key,
            disabled: card.category === (key as ECardCategory),
          })),
        },
      ];
    }, [card.category, databaseName, card.id, card.content, isTop, handlePresentationMode]);

    const handleMoreClick: MenuProps["onClick"] = useMemoizedFn(async ({ key }) => {
      if (key === "delete-card") {
        if (onDeleteCard) {
          await onDeleteCard(card.id);
        }
      } else if (key === "toggle-top") {
        if (onToggleCardTop) {
          await onToggleCardTop(card.id);
        }
      } else if (key === "export-markdown") {
        const markdown = getMarkdown(card.content);
        downloadMarkdown(markdown, String(card.id));
      } else if (key === "export-image") {
        setExportModalOpen(true);
      } else if (key === "export-epub") {
        setEpubExportModalOpen(true);
      } else if (key === "export-pdf") {
        setPdfExportModalOpen(true);
      } else if (Object.keys(cardCategoryName).includes(key)) {
        if (onUpdateCardCategory) {
          await onUpdateCardCategory(card, key as ECardCategory);
        }
      }
    });

    const handleNavigateToDetail = useMemoizedFn(() => {
      navigateTo(TabType.CardDetail, { id: card.id }, `卡片详情 #${card.id}`);
    });

    return (
      <>
        <div
          ref={node => {
            drag(node);
          }}
          className={classnames(
            "relative rounded-lg border p-5 hover:cursor-pointer",
            cardBgClass,
            cardBorderClass,
            { [activeBgClass]: isTop, [focusBorderClass]: isTop },
            className,
            { "opacity-50": isDragging }
          )}
          style={style}
          onClick={onClick}
        >
          {isTop && (
            <div className="absolute -left-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-white shadow-md">
              <AiFillPushpin className="text-base" />
            </div>
          )}
          <div className="mb-5 flex gap-2.5 text-xs text-gray-500">
            <span>创建于：{formatDate(card.create_time, true)}</span>
            <span>更新于：{formatDate(card.update_time, true)}</span>
          </div>
          <ErrorBoundary>
            <Editor
              contentId={contentId}
              ref={editorRef}
              className="max-h-75 pointer-events-none overflow-hidden"
              readonly={true}
              initValue={content.slice(0, 3)}
              previewBlocks={3}
              source={{ sourceType: "card", sourceId: card.id }}
              extensions={dynamicExtensions}
            />
          </ErrorBoundary>
          {tags.length > 0 && <Tags className="mt-5" tags={tags} showIcon />}
          <div className="absolute right-4 top-4 flex justify-end gap-2" onClick={stopPropagation}>
            <Tooltip title="进入详情">
              <div
                className={classnames(
                  "flex h-6 w-6 items-center justify-center rounded-lg",
                  hoverClass
                )}
                onClick={handleNavigateToDetail}
              >
                <IoResizeOutline />
              </div>
            </Tooltip>
            <Dropdown
              menu={{
                items: moreMenuItems,
                onClick: handleMoreClick,
              }}
            >
              <div
                className={classnames(
                  "flex h-6 w-6 items-center justify-center rounded-lg",
                  hoverClass
                )}
              >
                <MdMoreHoriz />
              </div>
            </Dropdown>
          </div>
        </div>

        <ContentExportModal
          open={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          content={card.content}
        />
        <EpubExportModal
          open={epubExportModalOpen}
          onClose={() => setEpubExportModalOpen(false)}
          content={card.content}
          title={getEditorText(card.content, 20) || `卡片 #${card.id}`}
        />
        <PdfExportModal
          visible={pdfExportModalOpen}
          onClose={() => setPdfExportModalOpen(false)}
          content={card.content}
          title={getEditorText(card.content, 20) || `卡片 #${card.id}`}
        />
      </>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.card.id === nextProps.card.id &&
      prevProps.card.update_time === nextProps.card.update_time &&
      prevProps.card.isTop === nextProps.card.isTop &&
      JSON.stringify(prevProps.card.tags) === JSON.stringify(nextProps.card.tags)
    );
  }
);

export default CardItem;
