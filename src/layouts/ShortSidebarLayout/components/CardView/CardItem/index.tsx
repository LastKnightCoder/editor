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
import Tags from "@/components/Tags";
import { formatDate, getMarkdown } from "@/utils";
import { getCardById, openCardInNewWindow } from "@/commands";
import { on, off } from "@/electron";
import {
  cardLinkExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";
import { IoResizeOutline } from "react-icons/io5";
import { MdMoreHoriz } from "react-icons/md";
import { Dropdown, MenuProps } from "antd";
import useCardManagement from "@/hooks/useCardManagement.ts";
import { useMemoizedFn } from "ahooks";
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import useSettingStore from "@/stores/useSettingStore.ts";
import ErrorBoundary from "@/components/ErrorBoundary";
import PresentationMode from "@/components/PresentationMode";

interface CardItemProps {
  card: ICard;
  onPresentationMode?: () => void;
  onExitPresentationMode?: () => void;
  className?: string;
  style?: React.CSSProperties;
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
    } = props;
    const [isPresentation, setIsPresentation] = useState(false);

    const editorRef = useRef<EditorRef>(null);

    const { onClickCard, onCtrlClickCard, onDeleteCard } = useCardManagement();

    const { updateCard } = useCardsManagementStore((state) => ({
      updateCard: state.updateCard,
    }));

    const { databaseName } = useSettingStore((state) => ({
      databaseName: state.setting.database.active,
    }));

    const { content, tags } = card;

    useEffect(() => {
      const handleCardWindowClosed = async (
        _event: any,
        data: { cardId: number; databaseName: string },
      ) => {
        if (data.cardId === card.id && data.databaseName === databaseName) {
          const card = await getCardById(data.cardId);
          editorRef.current?.setEditorValue(card.content.slice(0, 3));
          await updateCard(card);
        }
      };

      on("card-window-closed", handleCardWindowClosed);

      return () => {
        off("card-window-closed", handleCardWindowClosed);
      };
    }, [databaseName, card.id]);

    const moreMenuItems: MenuProps["items"] = useMemo(() => {
      return [
        {
          key: "open-card-in-new-window",
          label: "窗口打开",
          onClick: () => openCardInNewWindow(databaseName, card.id),
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
          children: [
            {
              key: "category-temporary",
              label: "闪念笔记",
              disabled: ECardCategory.Temporary === card.category,
            },
            {
              key: "category-permanent",
              label: "永久笔记",
              disabled: ECardCategory.Permanent === card.category,
            },
            {
              key: "category-theme",
              label: "主题笔记",
              disabled: ECardCategory.Theme === card.category,
            },
          ],
        },
      ];
    }, [card.category, databaseName, card.id]);

    const onClick = useMemoizedFn((e: MouseEvent<HTMLDivElement>) => {
      if (e.ctrlKey) {
        onCtrlClickCard(card.id);
      } else {
        onClickCard(card.id);
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
          await onDeleteCard(card.id);
        } else if (key === "export-markdown") {
          const markdown = getMarkdown(card.content);
          const blob = new Blob([markdown], { type: "text/markdown" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${card.id}.md`;
          a.click();
          URL.revokeObjectURL(url);
        } else if (key === "category-temporary") {
          if (card.category === ECardCategory.Temporary) return;
          await updateCard({
            ...card,
            category: ECardCategory.Temporary,
          });
        } else if (key === "category-permanent") {
          if (card.category === ECardCategory.Permanent) return;
          await updateCard({
            ...card,
            category: ECardCategory.Permanent,
          });
        } else if (key === "category-theme") {
          if (card.category === ECardCategory.Theme) return;
          await updateCard({
            ...card,
            category: ECardCategory.Theme,
          });
        }
      },
    );

    return (
      <>
        <div
          className={classnames(styles.itemContainer, className)}
          style={style}
          onClick={onClick}
        >
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
      prevProps.card.update_time === nextProps.card.update_time
    );
  },
);

export default CardItem;
