import { useEffect, useMemo, useRef, useState } from "react";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";
import { useNavigate } from "react-router-dom";
import { Descendant } from "slate";
import {
  LinkOutlined,
  ReadOutlined,
  MoreOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { Drawer, Tooltip, Dropdown, MenuProps, App } from "antd";
import SVG from "react-inlinesvg";
import { MdOutlineCode } from "react-icons/md";

import Editor, { EditorRef } from "@/components/Editor";
import AddTag from "@/components/AddTag";
import ErrorBoundary from "@/components/ErrorBoundary";
import EditorSourceValue from "@/components/EditorSourceValue";
import LinkGraph from "@/components/LinkGraph";
import PresentationMode from "@/components/PresentationMode";
import StatusBar from "@/components/StatusBar";
import ContentExportModal from "@/components/ContentExportModal";

import useUploadResource from "@/hooks/useUploadResource.ts";
import useEditContent from "@/hooks/useEditContent";

import useRightSidebarStore from "@/stores/useRightSidebarStore";
import useSettingStore from "@/stores/useSettingStore";

import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";
import { EditCardContext } from "@/context";
import {
  defaultCardEventBus,
  downloadMarkdown,
  getAllLinkedCards,
  getEditorText,
  getInlineLinks,
  getMarkdown,
  formatDate,
} from "@/utils";
import { ICard } from "@/types";
import { deleteCard, getAllCards, openCardInNewWindow } from "@/commands";
import graphIcon from "@/assets/icons/graph.svg";

import useEditCard from "../useEditCard";
import LinkList from "../LinkList";
import { isValid } from "@/components/WhiteBoard/utils";

import styles from "./index.module.less";

const customExtensions = [
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
];

interface IEditCardProps {
  cardId: number;
  defaultReadonly?: boolean;
}

const EditCard = (props: IEditCardProps) => {
  const { cardId, defaultReadonly = false } = props;
  const navigate = useNavigate();
  const { modal } = App.useApp();
  const databaseName = useSettingStore(
    (state) => state.setting.database.active,
  );

  const {
    onInit,
    initValue,
    loading,
    editingCard,
    onContentChange: onContentChangeFromEditCard,
    onAddTag,
    onDeleteTag,
    saveCard,
    onAddLinks,
    onRemoveLink,
    setEditingCard,
    prevCard,
  } = useEditCard(cardId);

  const { throttleHandleEditorContentChange } = useEditContent(
    editingCard?.contentId,
    (content) => {
      editorRef.current?.setEditorValue(content);
    },
  );

  const editorRef = useRef<EditorRef>(null);
  const cardEventBus = useCreation(
    () => defaultCardEventBus.createEditor(),
    [],
  );
  const [cards, setCards] = useState<ICard[]>([]);
  const [readonly, setReadonly] = useState(defaultReadonly);
  const [editorSourceValueOpen, setEditorSourceValueOpen] = useState(false);
  const [linkListOpen, setLinkListOpen] = useState(false);
  const [linkGraphOpen, setLinkGraphOpen] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [updateTime, setUpdateTime] = useState(editingCard?.update_time || 0);

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    if (!readonly) {
      throttleHandleEditorContentChange(content);
    }
    onContentChangeFromEditCard(content);
    setUpdateTime(Date.now());
  });

  useEffect(() => {
    if (editingCard?.update_time) {
      setUpdateTime(editingCard?.update_time);
    }
  }, [editingCard?.update_time]);

  const handleDeleteCard = useMemoizedFn(async (cardId: number) => {
    try {
      modal.confirm({
        title: "删除卡片",
        content: "确定要删除该卡片吗？",
        okText: "确定",
        cancelText: "取消",
        okButtonProps: {
          danger: true,
        },
        onOk: async () => {
          await deleteCard(cardId);
          navigate("/cards/list");
        },
      });
    } catch (error) {
      console.error("删除卡片失败", error);
    }
  });

  useEffect(() => {
    getAllCards().then((res) => {
      setCards(res);
    });
  }, []);

  const getCardLinks = useMemoizedFn((card: ICard) => {
    const links = getInlineLinks(card);
    return [...new Set([...links, ...card.links])];
  });

  const allLinkedCards = useMemo(() => {
    if (!editingCard) return [];
    const links = getAllLinkedCards(editingCard, cards);
    return links;
  }, [cards, editingCard?.links]);

  const handleAddTag = useMemoizedFn((tag: string) => {
    if (!editingCard || editingCard.tags.includes(tag)) return;
    onAddTag(tag);
  });

  const handleDeleteTag = useMemoizedFn((tag: string) => {
    if (!editingCard || !editingCard.tags.includes(tag)) return;
    onDeleteTag(tag);
  });
  const uploadResource = useUploadResource();

  useRafInterval(async () => {
    if (!readonly) {
      const updatedCard = await saveCard();
      if (updatedCard) {
        cardEventBus.publishCardEvent("card:updated", updatedCard);
      }
    }
  }, 500);

  useUnmount(async () => {
    if (!readonly) {
      throttleHandleEditorContentChange.flush();
      const updatedCard = await saveCard();
      if (updatedCard) {
        cardEventBus.publishCardEvent("card:updated", updatedCard);
      }
    }
  });

  useEffect(() => {
    const unsubscribe = cardEventBus.subscribeToCardWithId(
      "card:updated",
      cardId,
      (data) => {
        setEditingCard(data.card);
        prevCard.current = data.card;
      },
    );

    return () => {
      unsubscribe();
    };
  }, [cardId, cardEventBus, setEditingCard]);

  const statusBarConfigs = useMemo(() => {
    return [
      {
        key: "words-count",
        children: <>字数：{editingCard?.count}</>,
      },
      {
        key: "readonly",
        children: (
          <>
            {readonly ? (
              <Tooltip title={"编辑"}>
                <EditOutlined />
              </Tooltip>
            ) : (
              <Tooltip title={"预览"}>
                <ReadOutlined />
              </Tooltip>
            )}
          </>
        ),
        onClick: () => {
          setReadonly(!readonly);
        },
      },
      {
        key: "link-list",
        children: (
          <>
            <Tooltip title={"关联列表"}>
              <LinkOutlined />
            </Tooltip>
          </>
        ),
        onClick: () => {
          setLinkListOpen(true);
        },
      },
      {
        key: "link-graph",
        children: (
          <>
            <Tooltip title={"关联图谱"}>
              <SVG src={graphIcon} style={{ fill: "currentcolor" }} />
            </Tooltip>
          </>
        ),
        onClick: () => {
          setLinkGraphOpen(true);
        },
      },
      {
        key: "source",
        children: (
          <>
            <Tooltip title={"源码"}>
              <MdOutlineCode className={styles.icon} />
            </Tooltip>
          </>
        ),
        onClick: () => {
          setEditorSourceValueOpen(true);
        },
      },
    ].filter(isValid);
  }, [readonly, editingCard?.count]);

  const handleClickLinkCard = useMemoizedFn((card: ICard) => {
    const { addTab } = useRightSidebarStore.getState();
    addTab({
      id: String(card.id),
      title: getEditorText(card.content, 10),
      type: "card",
    });
  });

  const handleMoreMenuClick = useMemoizedFn(({ key }: { key: string }) => {
    if (!editingCard) return;

    if (key === "presentation") {
      setPresentationMode(true);
    } else if (key === "open-window") {
      openCardInNewWindow(databaseName, editingCard.id);
      navigate("/cards/list");
    } else if (key === "open-sidebar") {
      const { addTab } = useRightSidebarStore.getState();
      addTab({
        id: String(editingCard.id),
        title: getEditorText(editingCard.content, 10),
        type: "card",
      });
      navigate("/cards/list");
    } else if (key === "export-markdown") {
      const markdown = getMarkdown(editingCard.content);
      downloadMarkdown(markdown, String(editingCard.id));
    } else if (key === "export-image") {
      setExportModalOpen(true);
    } else if (key === "delete-card") {
      handleDeleteCard(editingCard.id);
    }
  });

  const moreMenuItems: MenuProps["items"] = useMemo(() => {
    return [
      {
        key: "presentation",
        label: "演示模式",
      },
      {
        key: "open-window",
        label: "窗口打开",
      },
      {
        key: "open-sidebar",
        label: "侧边打开",
      },
      {
        key: "export",
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
        ],
      },
      {
        key: "delete-card",
        label: "删除卡片",
      },
    ];
  }, []);

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (!editingCard) {
    return null;
  }

  return (
    <EditCardContext.Provider
      value={{
        cardId: editingCard.id,
      }}
    >
      <div className={styles.editCardContainer}>
        <div className={styles.time}>
          <div className={styles.timeInfo}>
            <div className={styles.createTime}>
              <span>创建于 {formatDate(editingCard.create_time, true)}</span>
            </div>
            <div className={styles.updateTime}>
              <span>
                最后修改于{" "}
                {formatDate(updateTime || editingCard.update_time, true)}
              </span>
            </div>
          </div>
          <div className={styles.moreActions}>
            <Dropdown
              menu={{ items: moreMenuItems, onClick: handleMoreMenuClick }}
            >
              <MoreOutlined />
            </Dropdown>
          </div>
        </div>
        <div className={styles.editorContainer}>
          <div className={styles.editor}>
            <ErrorBoundary>
              <Editor
                key={editingCard.id}
                ref={editorRef}
                onInit={onInit}
                initValue={initValue}
                onChange={onContentChange}
                extensions={customExtensions}
                readonly={readonly}
                uploadResource={uploadResource}
              />
            </ErrorBoundary>
          </div>
        </div>
        <div className={styles.addTag}>
          <AddTag
            tags={editingCard.tags}
            addTag={handleAddTag}
            removeTag={handleDeleteTag}
            readonly={readonly}
          />
        </div>
        <StatusBar className={styles.statusBar} configs={statusBarConfigs} />
        <Drawer
          title="关联列表"
          open={linkListOpen}
          width={500}
          onClose={() => setLinkListOpen(false)}
        >
          <LinkList
            onClickLinkCard={handleClickLinkCard}
            addLinks={onAddLinks}
            removeLink={onRemoveLink}
            editingCard={editingCard}
            readonly={readonly}
          />
        </Drawer>
        <Drawer
          title="关联图谱"
          open={linkGraphOpen}
          width={500}
          onClose={() => setLinkGraphOpen(false)}
        >
          <LinkGraph
            key={editingCard.id}
            cards={allLinkedCards}
            currentCardIds={[editingCard.id]}
            cardWidth={360}
            getCardLinks={getCardLinks}
            fitView={allLinkedCards.length > 20}
            style={{
              height: "calc(100vh - 105px)",
            }}
            onClickCard={handleClickLinkCard}
          />
        </Drawer>
        <EditorSourceValue
          open={editorSourceValueOpen}
          onClose={() => setEditorSourceValueOpen(false)}
          content={editingCard.content}
        />
        {presentationMode && (
          <PresentationMode
            content={editingCard.content}
            onExit={() => {
              setPresentationMode(false);
            }}
          />
        )}
        <ContentExportModal
          open={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          content={editingCard.content}
        />
      </div>
    </EditCardContext.Provider>
  );
};

export default EditCard;
