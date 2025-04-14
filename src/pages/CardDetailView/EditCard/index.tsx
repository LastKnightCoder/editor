import { useEffect, useMemo, useRef, useState } from "react";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";
import { useNavigate } from "react-router-dom";

import Editor, { EditorRef } from "@/components/Editor";
import AddTag from "@/components/AddTag";
import ErrorBoundary from "@/components/ErrorBoundary";

import useUploadResource from "@/hooks/useUploadResource.ts";
import {
  contentLinkExtension,
  fileAttachmentExtension,
  questionCardExtension,
} from "@/editor-extensions";
import { Descendant } from "slate";
import { formatDate } from "@/utils/time.ts";
import { EditCardContext } from "@/context";
import {
  defaultCardEventBus,
  getAllLinkedCards,
  getEditorText,
  getInlineLinks,
} from "@/utils";

import styles from "./index.module.less";
import { useWindowFocus } from "@/hooks/useWindowFocus";
import useEditCard from "../useEditCard";
import StatusBar from "@/components/StatusBar";
import { LinkOutlined, ReadOutlined, MoreOutlined } from "@ant-design/icons";
import { Drawer, Tooltip, Dropdown, MenuProps } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { MdOutlineCode } from "react-icons/md";
import { isValid } from "@/components/WhiteBoard/utils";
import LinkList from "../LinkList";
import { ICard } from "@/types";
import useRightSidebarStore from "@/stores/useRightSidebarStore";
import EditorSourceValue from "@/components/EditorSourceValue";
import LinkGraph from "@/components/LinkGraph";
import { getAllCards, openCardInNewWindow } from "@/commands";
import SVG from "react-inlinesvg";
import graphIcon from "@/assets/icons/graph.svg";
import PresentationMode from "@/components/PresentationMode";
import useSettingStore from "@/stores/useSettingStore";
import useEditContent from "@/hooks/useEditContent";

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

  const isWindowFocused = useWindowFocus();
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

  const onContentChange = useMemoizedFn((content: Descendant[]) => {
    if (isWindowFocused && editorRef.current?.isFocus() && !readonly) {
      throttleHandleEditorContentChange(content);
    }
    onContentChangeFromEditCard(content);
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
    if (!readonly && editorRef.current?.isFocus() && isWindowFocused) {
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
                最后修改于 {formatDate(editingCard.update_time, true)}
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
      </div>
    </EditCardContext.Provider>
  );
};

export default EditCard;
