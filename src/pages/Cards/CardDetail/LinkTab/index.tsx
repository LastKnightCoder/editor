import { useMemo } from "react";
import { App, Button, message, Tabs, TabsProps } from 'antd';
import CardItem2 from "@/pages/Cards/CardItem2";
import LinkGraph from "@/components/LinkGraph";

import useCardsManagementStore from "@/stores/useCardsManagementStore.ts";
import useEditCardStore from "@/stores/useEditCardStore.ts";

import { getAllLinkedCards } from "../utils.ts";

import { ICard } from "@/types";

import styles from "./index.module.less";

interface ILinkTabProps {
  onClickLinkCard: (id: number) => Promise<void>;
}

const LinkTab = (props: ILinkTabProps) => {
  const { onClickLinkCard } = props;

  const { modal } = App.useApp();

  const {
    cards,
  } = useCardsManagementStore((state) => ({
    cards: state.cards,
  }))

  const {
    editingCard,
    removeLink,
    readonly,
  } = useEditCardStore((state) => ({
    editingCard: state.editingCard,
    removeLink: state.removeLink,
    readonly: state.readonly,
  }));

  const openAddLinkModal = () => {
    if (readonly) {
      message.warning('只读模式下无法添加连接').then();
      return;
    }
    useEditCardStore.setState({
      addLinkModalOpen: true,
    });
  }

  const onRemoveLink = async (cardId: number) => {
    modal.confirm({
      title: '确认删除连接？',
      content: '删除连接后，该卡片将不再出现在连接列表中',
      onOk: async () => {
        await removeLink(cardId);
      },
      okText: '确认',
      cancelText: '取消',
      okButtonProps: {
        danger: true
      }
    })
  }

  const linkedList = editingCard?.links
    .map(id => cards.find(card => card.id === id))
    .filter(Boolean) as ICard[];

  // 不能添加 editingCardId 依赖，否则每次编辑都会导致重新关系图
  const allLinkedCards = useMemo(() => {
    if (!editingCard || !editingCard.id) return [];
    return getAllLinkedCards(editingCard as ICard, cards);
  }, [editingCard?.id, editingCard?.links, cards]);

  if (!editingCard) return null;

  const items: TabsProps['items'] = [{
    key: 'card',
    label: '列表',
    children: (
      <div className={styles.linkList}>
        {
          linkedList.map((card) => (
            <CardItem2
              onClick={() => { onClickLinkCard(card.id).then() }}
              card={card}
              key={card.id}
              showTags
              maxRows={4}
              settings={[{
                title: '删除连接',
                onClick: () => {
                  modal.confirm({
                    title: '确认删除连接？',
                    onOk: async () => {
                      await onRemoveLink(card.id);
                    },
                    okButtonProps: {
                      danger: true,
                    }
                  })
                }
              }]}
            />
          ))
        }
        <Button onClick={openAddLinkModal} style={{ marginLeft: 'auto' }}>添加卡片</Button>
      </div>
    )
  }, {
    key: 'graph',
    label: '图谱',
    children: (
      <div className={styles.linksGraph}>
        <LinkGraph
          cards={allLinkedCards}
          cardWidth={180}
          cardMaxHeight={200}
          cardFontSize={14}
          currentCardId={editingCard?.id}
          style={{
            height: 'calc(100vh - var(--title-bar-height) - 142px)'
          }}
        />
      </div>
    )
  }]

  return (
    <Tabs items={items} />
  )
}

export default LinkTab;