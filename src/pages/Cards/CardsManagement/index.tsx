import { useMemo, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { Drawer, Skeleton, Tooltip } from "antd";
import { EditOutlined, ReadOutlined } from '@ant-design/icons';
import { MdOutlineCode } from "react-icons/md";
import { PiGraph, PiListBullets } from "react-icons/pi";

import CardTabs from './CardTabs';
import EditCard from "../EditCard";
import If from "@/components/If";

import useEditCard from "../hooks/useEditCard.ts";
import { EActiveSide } from "@/stores/useCardPanelStore.ts";

import styles from './index.module.less';
import LinkList from "@/pages/Cards/EditCard/LinkList";
import LinkGraph from "@/components/LinkGraph";
import EditorSourceValue from "@/components/EditorSourceValue";
import { getAllLinkedCards, getInlineLinks } from "./utils.ts";
import { ICard } from "@/types";
import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";

interface ICardsManagementProps {
  cardIds: number[];
  activeCardId?: number;
  side: EActiveSide;
  onClickCard: (id: number) => void;
  onClickTab: (id: number) => void;
  onCloseTab: (id: number) => void;
  onMoveCard: (cardId: number) => void;
}

const CardsManagement = (props: ICardsManagementProps) => {
  const {
    cardIds,
    activeCardId,
    side,
    onClickCard: onClickLinkCard,
    onCloseTab,
    onClickTab,
    onMoveCard,
  } = props;

  const {
    cards
  } = useCardsManagementStore((state) => ({
    cards: state.cards,
  }));

  const [readonly, setReadonly] = useState(false);
  const [sourceValueOpen, setSourceValueOpen] = useState(false);
  const [linkGraphOpen, setLinkGraphOpen] = useState(false);
  const [linkListOpen, setLinkListOpen] = useState(false);

  const {
    editingCard,
    loading,
    saveCard,
    onContentChange,
    onAddTag,
    onDeleteTag,
    onAddLink,
    onRemoveLink,
  } = useEditCard(activeCardId);

  const getCardLinks = useMemoizedFn((card: ICard) => {
    const links = getInlineLinks(card);
    return [...new Set([...links, ...card.links])];
  })

  const allLinkedCards = useMemo(() => {
    if (!editingCard) return [];
    return getAllLinkedCards(editingCard, cards);
  }, [editingCard?.links, cards]);

  return (
    <div className={styles.manageContainer}>
      <div className={styles.cardsManagement}>
        <CardTabs
          cardIds={cardIds}
          activeCardId={activeCardId}
          side={side}
          onClickTab={onClickTab}
          onCloseTab={onCloseTab}
          onMoveCard={onMoveCard}
        />
        {
          activeCardId && (
            <div className={styles.editCardContainer}>
              {
                loading ? (
                  <Skeleton active paragraph={{ rows: 4 }} />
                ) : (
                  editingCard && (
                    <EditCard
                      key={editingCard.id}
                      readonly={readonly}
                      editingCard={editingCard}
                      onContentChange={onContentChange}
                      onAddTag={onAddTag}
                      onDeleteTag={onDeleteTag}
                      saveCard={saveCard}
                    />
                  )
                )
              }
            </div>
          )
        }
      </div>
      <If condition={!!activeCardId}>
        <div className={styles.statusBar}>
          <div>
            <If condition={!!activeCardId}>
              <Tooltip title={'关联图谱'}>
                <PiGraph
                  style={{ transform: 'translateY(1.5px)' }}
                  className={styles.icon}
                  onClick={() => setLinkGraphOpen(true)}
                />
              </Tooltip>
            </If>
          </div>
          <div>
            <If condition={!!activeCardId}>
              <Tooltip title={'关联列表'}>
                <PiListBullets
                  style={{ transform: 'translateY(1.5px)' }}
                  className={styles.icon}
                  onClick={() => setLinkListOpen(true)}
                />
              </Tooltip>
            </If>
          </div>
          <div>
            {
              readonly ? (
                <Tooltip title={'编辑'}>
                  <EditOutlined onClick={() => setReadonly(false)} />
                </Tooltip>
              ) : (
                <Tooltip title={'预览'}>
                  <ReadOutlined onClick={() => setReadonly(true)} />
                </Tooltip>
              )
            }
          </div>
          <div>
            <If condition={!!activeCardId}>
              <Tooltip title={'源码'}>
                <MdOutlineCode
                  className={styles.icon}
                  style={{ transform: 'scale(1.2)', transformOrigin: 'center top' }}
                  onClick={() => setSourceValueOpen(true)}
                />
              </Tooltip>
            </If>
          </div>
        </div>
      </If>
      {
        editingCard && (
          <>
            <Drawer
              title={'关联列表'}
              width={420}
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
              width={420}
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
                fitView={allLinkedCards.length > 20}
              />
            </Drawer>
            <EditorSourceValue
              open={sourceValueOpen}
              onClose={() => { setSourceValueOpen(false) }}
              content={editingCard.content}
            />
          </>
        )
      }
    </div>
  )
}

export default CardsManagement;