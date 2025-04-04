import { useEffect, useMemo, useRef, useState } from "react";
import { Descendant } from "slate";
import { useCreation, useMemoizedFn, useRafInterval, useUnmount } from "ahooks";

import Editor, { EditorRef } from "@/components/Editor";
import AddTag from "@/components/AddTag";
import ErrorBoundary from "@/components/ErrorBoundary";

import useUploadResource from "@/hooks/useUploadResource.ts";
import {
  cardLinkExtension,
  fileAttachmentExtension,
} from "@/editor-extensions";
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
import { LinkOutlined, ReadOutlined } from "@ant-design/icons";
import { Drawer, Tooltip } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { MdOutlineCode } from "react-icons/md";
import { isValid } from "@/components/WhiteBoard/utils";
import LinkList from "../LinkList";
import { ICard } from "@/types";
import useRightSidebarStore from "@/stores/useRightSidebarStore";
import EditorSourceValue from "@/components/EditorSourceValue";
import LinkGraph from "@/components/LinkGraph";
import { getAllCards } from "@/commands";
import SVG from "react-inlinesvg";
import graphIcon from "@/assets/icons/graph.svg";

const customExtensions = [cardLinkExtension, fileAttachmentExtension];

interface IEditCardProps {
  cardId: number;
  defaultReadonly?: boolean;
}

const EditCard = (props: IEditCardProps) => {
  const { cardId, defaultReadonly = false } = props;

  const {
    initValue,
    loading,
    editingCard,
    onInit,
    onContentChange,
    onAddTag,
    onDeleteTag,
    saveCard,
    onAddLinks,
    onRemoveLink,
  } = useEditCard(cardId);

  const isWindowFocused = useWindowFocus();

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

  const onChange = useMemoizedFn((value: Descendant[]) => {
    if (!editingCard || !editorRef.current?.isFocus() || !isWindowFocused)
      return;
    onContentChange(value);
    cardEventBus.publishCardEvent("card:updated", {
      ...editingCard,
      content: value,
    });
  });

  const handleAddTag = useMemoizedFn((tag: string) => {
    if (!editingCard || editingCard.tags.includes(tag)) return;
    onAddTag(tag);
    cardEventBus.publishCardEvent("card:updated", {
      ...editingCard,
      tags: [...editingCard.tags, tag],
    });
  });

  const handleDeleteTag = useMemoizedFn((tag: string) => {
    if (!editingCard || !editingCard.tags.includes(tag)) return;
    onDeleteTag(tag);
    cardEventBus.publishCardEvent("card:updated", {
      ...editingCard,
      tags: editingCard.tags.filter((t) => t !== tag),
    });
  });
  const uploadResource = useUploadResource();

  useRafInterval(() => {
    if (!readonly && editorRef.current?.isFocus() && isWindowFocused) {
      saveCard();
    }
  }, 3000);

  useUnmount(() => {
    if (!readonly) {
      saveCard();
    }
  });

  useEffect(() => {
    const unsubscribe = cardEventBus.subscribeToCardWithId(
      "card:updated",
      cardId,
      (data) => {
        // onContentChange(data.card.content);
        editorRef.current?.setEditorValue(data.card.content);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [cardId, cardEventBus, onContentChange]);

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
              <SVG src={graphIcon} />
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
          <div>
            <span>创建于 {formatDate(editingCard.create_time, true)}</span>
          </div>
          <div>
            <span>最后修改于 {formatDate(editingCard.update_time, true)}</span>
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
                onChange={onChange}
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
      </div>
    </EditCardContext.Provider>
  );
};

export default EditCard;
