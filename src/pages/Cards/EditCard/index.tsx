import { useEffect, useState, useMemo, createContext } from "react";
import { Button, Drawer, Skeleton, Tag } from "antd";
import dayjs from "dayjs";
import classnames from "classnames";

import { CaretRightOutlined } from "@ant-design/icons";
import { MdAccessTime } from "react-icons/md";
import { FaTags } from "react-icons/fa6";
import { SlGraph } from "react-icons/sl";

import Editor from '@/components/Editor';
import AddTag from "@/components/AddTag";
import LinkGraph from "@/components/LinkGraph";
import EditorSourceValue from "@/components/EditorSourceValue";
import ErrorBoundary from "@/components/ErrorBoundary";
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
  readonly?: boolean;
}

export const EditCardContext = createContext<{ cardId: number } | null>(null);

const EditCard = (props: IEditCardProps) => {
  const { cardId, onClickLinkCard, readonly = false } = props;

  const [linkGraphOpen, setLinkGraphOpen] = useState(false);
  const [linkListOpen, setLinkListOpen] = useState(false);
  const [sourceValueOpen, setSourceValueOpen] = useState(false);
  const [isFieldsShow, setIsFieldsShow] = useState(false);

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
    return () => {
      saveCard();
    }
  }, [saveCard]);

  const arrowClass = classnames(styles.arrow, {
    [styles.show]: isFieldsShow,
    [styles.hide]: !isFieldsShow
  });

  if (loading) return <Skeleton active />;

  if (!editingCard) return null;

  return (
    <EditCardContext.Provider value={{
      cardId
    }}>
      <div className={styles.editCardContainer}>
        <div className={classnames(styles.fieldsContainer)}>
          <div className={styles.titleContainer}>
            <div className={styles.title}>卡片属性</div>
            <div
              className={arrowClass}
              onClick={() => {
                setIsFieldsShow(!isFieldsShow);
              }}
            >
              <CaretRightOutlined />
            </div>
          </div>
          <div className={classnames(styles.content, {
            [styles.show]: isFieldsShow
          })}>
            <div className={styles.fields}>
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
                  <span>关联卡片</span>
                </div>
                <div className={styles.fieldValue}>
                  <Button onClick={() => { setLinkGraphOpen(true) }}>图谱</Button>
                  <Button style={{ marginLeft: 8 }} onClick={() => { setLinkListOpen(true) }}>列表</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.editor}>
          <ErrorBoundary>
            <Editor
              initValue={initValue}
              onChange={onContentChange}
              extensions={customExtensions}
              readonly={readonly}
            />
          </ErrorBoundary>
        </div>
        <Drawer
          title={'关联列表'}
          width={720}
          open={linkListOpen}
          onClose={() => { setLinkListOpen(false) }}
        >
          <LinkList
            onClickLinkCard={onClickLinkCard}
            addLink={onAddLink}
            removeLink={onRemoveLink}
            editingCard={editingCard}
            readonly={readonly}
          />
        </Drawer>
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