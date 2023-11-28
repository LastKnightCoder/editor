import { useEffect, useState, useMemo, createContext } from "react";
import { Button, Drawer, Skeleton, Tag } from "antd";
import isHotkey from "is-hotkey";
import dayjs from "dayjs";

import { MdAccessTime } from "react-icons/md";
import { FaTags } from "react-icons/fa6";
import { SlGraph } from "react-icons/sl";
import Editor from '@/components/Editor';
import AddTag from "@/components/AddTag";
import LinkGraph from "@/components/LinkGraph";
import EditorSourceValue from "@/components/EditorSourceValue";
import LinkList from './LinkList';

import { cardLinkExtension } from "@/editor-extensions";

import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import useEditCard from "../hooks/useEditCard.ts";

import { ICard } from "@/types";

import { getAllLinkedCards, getInlineLinks } from "./utils.ts";
import styles from './index.module.less';


const customExtensions = [cardLinkExtension];

const getCardLinks = (card: ICard) => {
  const links = getInlineLinks(card);
  return [...new Set([...links, ...card.links])];
}

interface IEditCardProps {
  cardId: number;
  onClickLinkCard: (id: number) => void;
}

export const EditCardContext = createContext<{ cardId: number } | null>(null);

const EditCard = (props: IEditCardProps) => {
  const { cardId, onClickLinkCard } = props;

  const [readonly, setReadonly] = useState(false);
  const [linkGraphOpen, setLinkGraphOpen] = useState(false);
  const [sourceValueOpen, setSourceValueOpen] = useState(false);

  const {
    initValue,
    editingCard,
    loading,
    saveCard,
    onContentChange,
    onAddTag,
    onDeleteTag,
    onAddLink,
    onRemoveLink,
  } = useEditCard(cardId);

  const {
    cards
  } = useCardsManagementStore((state) => ({
    cards: state.cards,
  }))

  const allLinkedCards = useMemo(() => {
    if (!editingCard) return [];
    return getAllLinkedCards(editingCard as ICard, cards);
  }, [editingCard?.links, cards]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotkey('mod+shift+/', e)) {
        setSourceValueOpen(open => !open);
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, [])

  useEffect(() => {
    return () => {
      saveCard();
    }
  }, [saveCard]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotkey('mod+/', e)) {
        setReadonly(!readonly);
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, [readonly]);

  if (loading) return <Skeleton active />;

  if (!editingCard) return null;

  return (
    <EditCardContext.Provider value={{
      cardId
    }}>
      <div className={styles.editCardContainer}>
        <div className={styles.fields}>
          <div className={styles.title}>卡片属性</div>
          <div className={styles.field}>
            <div className={styles.fieldKey}>
              <MdAccessTime className={styles.icon} />
              <span>创建时间</span>
            </div>
            <div className={styles.fieldValue}>
              <Tag color={'red'}>{dayjs(editingCard.create_time).format('YYYY/MM/DD HH:mm:ss')}</Tag>
            </div>
          </div>
          <div className={styles.field}>
            <div className={styles.fieldKey}>
              <MdAccessTime className={styles.icon} />
              <span>更新时间</span>
            </div>
            <div className={styles.fieldValue}>
              <Tag color={'purple'}>{dayjs(editingCard.update_time).format('YYYY/MM/DD HH:mm:ss')}</Tag>
            </div>
          </div>
          <div  className={styles.field}>
            <div className={styles.fieldKey}>
              <FaTags className={styles.icon} />
              <span>标签</span>
            </div>
            <div className={styles.fieldValue}>
              <AddTag tags={editingCard.tags} addTag={onAddTag} removeTag={onDeleteTag} readonly={readonly} />
            </div>
          </div>
          <div  className={styles.field}>
            <div className={styles.fieldKey}>
              <SlGraph className={styles.icon} />
              <span>关联图谱</span>
            </div>
            <div className={styles.fieldValue}>
              <Button onClick={() => { setLinkGraphOpen(true) }}>打开</Button>
            </div>
          </div>
        </div>
        <div className={styles.editor}>
          <Editor
            initValue={initValue}
            onChange={onContentChange}
            extensions={customExtensions}
            readonly={readonly}
          />
        </div>
        <div className={styles.links}>
          <div className={styles.title}>关联卡片</div>
          <LinkList
            onClickLinkCard={onClickLinkCard}
            addLink={onAddLink}
            removeLink={onRemoveLink}
            editingCard={editingCard}
            readonly={readonly}
          />
        </div>
        <Drawer
          title={'关联图谱'}
          width={720}
          open={linkGraphOpen}
          onClose={() => { setLinkGraphOpen(false) }}
        >
          <LinkGraph
            cards={allLinkedCards}
            currentCardId={editingCard.id}
            cardWidth={320}
            getCardLinks={getCardLinks}
            style={{
              height: 'calc(100vh - 105px)'
            }}
          />
        </Drawer>
        <EditorSourceValue
          open={sourceValueOpen}
          onClose={() => { setSourceValueOpen(false) }}
          content={editingCard.content}
        />
      </div>
    </EditCardContext.Provider>
  )
}

export default EditCard;