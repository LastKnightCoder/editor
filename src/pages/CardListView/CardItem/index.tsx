import classnames from "classnames";
import { ECardCategory, ICard } from "@/types";
import Editor, { EditorRef } from "@editor/index.tsx";
import styles from "./index.module.less";
import React, {
  MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from "react";
import { useShallow } from "zustand/react/shallow";
import Tags from "@/components/Tags";
import { formatDate, getEditorText, getMarkdown } from "@/utils";
import { openCardInNewWindow } from "@/commands";
import {
  cardLinkExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";
import { IoResizeOutline } from "react-icons/io5";
import { MdMoreHoriz } from "react-icons/md";
import { AiFillPushpin } from "react-icons/ai";
import { Dropdown, MenuProps } from "antd";
import { useCreation, useMemoizedFn } from "ahooks";
import useSettingStore from "@/stores/useSettingStore.ts";
import ErrorBoundary from "@/components/ErrorBoundary";
import PresentationMode from "@/components/PresentationMode";
import useRightSidebarStore from "@/stores/useRightSidebarStore";
import { defaultCardEventBus } from "@/utils";
import { cardCategoryName } from "@/constants";

interface CardItemProps {
  card: ICard;
  onPresentationMode?: () => void;
  onExitPresentationMode?: () => void;
  onCardClick?: (card: ICard) => void;
  onDeleteCard?: (cardId: number) => Promise<void>;
  onUpdateCardCategory?: (
    card: ICard,
    category: ECardCategory,
  ) => Promise<void>;
  onToggleCardTop?: (cardId: number) => Promise<void>;
  className?: string;
  style?: React.CSSProperties;
  onCardChange: (card: ICard) => void;
}

const customExtensions = [cardLinkExtension, fileAttachmentExtension];

const CardItem = memo(
  (props: CardItemProps) => {
    const {
      card,
      className,
      style,
      onPresentationMode,
      onExitPresentationMode,
      onCardClick,
      onDeleteCard,
      onUpdateCardCategory,
      onToggleCardTop,
      onCardChange,
    } = props;
    const [isPresentation, setIsPresentation] = useState(false);

    const editorRef = useRef<EditorRef>(null);
    const cardEventBus = useCreation(
      () => defaultCardEventBus.createEditor(),
      [],
    );

    const addTab = useRightSidebarStore((state) => state.addTab);

    const databaseName = useSettingStore(
      useShallow((state) => state.setting.database.active),
    );

    const { content, tags, isTop } = card;

    useEffect(() => {
      const unsubscribe = cardEventBus.subscribeToCardWithId(
        "card:updated",
        card.id,
        (data) => {
          editorRef.current?.setEditorValue(data.card.content.slice(0, 3));
          onCardChange(data.card);
        },
      );

      return () => {
        unsubscribe();
      };
    }, [card.id, cardEventBus]);

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

    const onClick = useMemoizedFn(() => {
      if (onCardClick) {
        onCardClick(card);
      }
    });

    const stopPropagation = useMemoizedFn((e: MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
    });

    const handlePresentationMode = useMemoizedFn(() => {
      setIsPresentation(true);
      onPresentationMode?.();
    });

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
          const blob = new Blob([markdown], { type: "text/markdown" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${card.id}.md`;
          a.click();
          URL.revokeObjectURL(url);
        } else if (Object.keys(cardCategoryName).includes(key)) {
          if (onUpdateCardCategory) {
            await onUpdateCardCategory(card, key as ECardCategory);
            cardEventBus.publishCardEvent("card:updated", card);
          }
        }
      },
    );

    return (
      <>
        <div
          className={classnames(styles.itemContainer, className, {
            [styles.isTop]: isTop,
          })}
          style={style}
          onClick={onClick}
        >
          {isTop && (
            <div className={styles.topFlag}>
              <AiFillPushpin />
            </div>
          )}
          <div className={styles.time}>
            <span>创建于：{formatDate(card.create_time, true)}</span>
            <span>更新于：{formatDate(card.update_time, true)}</span>
          </div>
          <ErrorBoundary>
            <Editor
              ref={editorRef}
              className={styles.content}
              readonly={true}
              initValue={content.slice(0, 3)}
              extensions={customExtensions}
            />
          </ErrorBoundary>
          {tags.length > 0 && (
            <Tags className={styles.tags} tags={tags} showIcon />
          )}
          <div className={styles.actions} onClick={stopPropagation}>
            <div className={styles.action} onClick={handlePresentationMode}>
              <IoResizeOutline />
            </div>
            <Dropdown
              menu={{
                items: moreMenuItems,
                onClick: handleMoreClick,
              }}
            >
              <div className={styles.action}>
                <MdMoreHoriz />
              </div>
            </Dropdown>
          </div>
        </div>

        {isPresentation && (
          <PresentationMode
            content={card.content}
            onExit={() => {
              setIsPresentation(false);
              onExitPresentationMode?.();
            }}
          />
        )}
      </>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.card.id === nextProps.card.id &&
      prevProps.card.update_time === nextProps.card.update_time &&
      prevProps.card.isTop === nextProps.card.isTop
    );
  },
);

export default CardItem;
