import React, { MouseEvent, useMemo, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import classnames from "classnames";
import { IoResizeOutline } from "react-icons/io5";
import { MdMoreHoriz } from "react-icons/md";
import { AiFillPushpin } from "react-icons/ai";
import { Dropdown, MenuProps, Tooltip } from "antd";
import { useCreation, useMemoizedFn } from "ahooks";
import Editor, { EditorRef } from "@editor/index.tsx";
import { useShallow } from "zustand/react/shallow";

import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";

import Tags from "@/components/Tags";
import ErrorBoundary from "@/components/ErrorBoundary";
import {
  formatDate,
  getEditorText,
  getMarkdown,
  defaultCardEventBus,
  downloadMarkdown,
} from "@/utils";
import { openCardInNewWindow } from "@/commands";
import useRightSidebarStore from "@/stores/useRightSidebarStore";
import useSettingStore from "@/stores/useSettingStore.ts";
import { ECardCategory, ICard } from "@/types";
import { cardCategoryName } from "@/constants";
import useEditContent from "@/hooks/useEditContent";

interface CardItemProps {
  card: ICard;
  onPresentationMode: (card: ICard) => void;
  onCardClick?: (card: ICard) => void;
  onDeleteCard?: (cardId: number) => Promise<void>;
  onUpdateCardCategory?: (
    card: ICard,
    category: ECardCategory,
  ) => Promise<void>;
  onToggleCardTop?: (cardId: number) => Promise<void>;
  className?: string;
  style?: React.CSSProperties;
}

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
];

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

    const navigate = useNavigate();

    const editorRef = useRef<EditorRef>(null);
    const cardEventBus = useCreation(
      () => defaultCardEventBus.createEditor(),
      [],
    );

    const addTab = useRightSidebarStore((state) => state.addTab);

    const databaseName = useSettingStore(
      useShallow((state) => state.setting.database.active),
    );

    const { content, tags, isTop, contentId } = card;

    useEditContent(contentId, (content) => {
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
          key: "open-card-in-right-sidebar",
          label: "右侧打开",
          onClick: () => {
            addTab({
              type: "card",
              id: String(card.id),
              title: getEditorText(card.content, 10),
            });
          },
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
          ],
        },
        {
          key: "edit-category",
          label: "编辑分类",
          children: Object.keys(cardCategoryName).map((key) => ({
            label: cardCategoryName[key as ECardCategory],
            key: key,
            disabled: card.category === (key as ECardCategory),
          })),
        },
      ];
    }, [card.category, databaseName, card.id, addTab, card.content, isTop]);

    const handleMoreClick: MenuProps["onClick"] = useMemoizedFn(
      async ({ key }) => {
        if (key === "delete-card") {
          if (onDeleteCard) {
            await onDeleteCard(card.id);
          }
        } else if (key === "toggle-top") {
          if (onToggleCardTop) {
            await onToggleCardTop(card.id);
            cardEventBus.publishCardEvent("card:updated", card);
          }
        } else if (key === "export-markdown") {
          const markdown = getMarkdown(card.content);
          downloadMarkdown(markdown, String(card.id));
        } else if (Object.keys(cardCategoryName).includes(key)) {
          if (onUpdateCardCategory) {
            await onUpdateCardCategory(card, key as ECardCategory);
            cardEventBus.publishCardEvent("card:updated", card);
          }
        }
      },
    );

    const handleNavigateToDetail = useMemoizedFn(() => {
      navigate(`/cards/detail/${card.id}`);
    });

    return (
      <>
        <div
          className={classnames(
            "p-5 border border-[var(--line-color)] rounded-lg relative hover:cursor-pointer",
            isTop &&
              "bg-gradient-to-br from-orange-500/10 to-transparent border-orange-500/30",
            className,
          )}
          style={style}
          onClick={onClick}
        >
          {isTop && (
            <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white shadow-md">
              <AiFillPushpin className="text-base" />
            </div>
          )}
          <div className="mb-5 flex text-xs gap-2.5 text-gray-500">
            <span>创建于：{formatDate(card.create_time, true)}</span>
            <span>更新于：{formatDate(card.update_time, true)}</span>
          </div>
          <ErrorBoundary>
            <Editor
              ref={editorRef}
              className="max-h-75 overflow-hidden pointer-events-none"
              readonly={true}
              initValue={content.slice(0, 3)}
              extensions={customExtensions}
            />
          </ErrorBoundary>
          {tags.length > 0 && <Tags className="mt-5" tags={tags} showIcon />}
          <div
            className="absolute top-4 right-4 flex justify-end gap-2"
            onClick={stopPropagation}
          >
            <Tooltip title="进入详情">
              <div
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-[var(--common-hover-bg)]"
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
              <div className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-[var(--common-hover-bg)]">
                <MdMoreHoriz />
              </div>
            </Dropdown>
          </div>
        </div>
      </>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.card.id === nextProps.card.id &&
      prevProps.card.update_time === nextProps.card.update_time &&
      prevProps.card.isTop === nextProps.card.isTop &&
      JSON.stringify(prevProps.card.tags) ===
        JSON.stringify(nextProps.card.tags)
    );
  },
);

export default CardItem;
