import { useEffect, useState } from "react";
import { App, Button, Empty, message } from "antd";
import CardItem2 from "@/components/CardItem2";
import If from "@/components/If";
import AddCardLinkModal from "../AddCardLinkModal";

import { ICard } from "@/types";

import styles from "./index.module.less";
import { getAllCards } from "@/commands";

interface ILinkListProps {
  onClickLinkCard: (card: ICard) => void;
  addLinks: (ids: number[]) => Promise<void>;
  removeLink: (id: number) => Promise<void>;
  editingCard: ICard;
  readonly?: boolean;
}

const LinkList = (props: ILinkListProps) => {
  const {
    onClickLinkCard,
    addLinks,
    removeLink,
    editingCard,
    readonly = false,
  } = props;

  const [addLinkModalOpen, setAddLinkModalOpen] = useState(false);

  const { modal } = App.useApp();

  const [cards, setCards] = useState<ICard[]>([]);

  useEffect(() => {
    getAllCards().then((cards) => {
      setCards(cards);
    });
  }, []);

  const openAddLinkModal = () => {
    if (readonly) {
      message.warning("只读模式下无法添加连接").then();
      return;
    }

    setAddLinkModalOpen(true);
  };

  const onRemoveLink = async (cardId: number) => {
    modal.confirm({
      title: "确认删除连接？",
      content: "删除连接后，该卡片将不再出现在连接列表中",
      onOk: async () => {
        await removeLink(cardId);
      },
      okText: "确认",
      cancelText: "取消",
      okButtonProps: {
        danger: true,
      },
    });
  };

  const linkedList = editingCard?.links
    .map((id) => cards.find((card) => card.id === id))
    .filter(Boolean) as ICard[];

  if (!editingCard) return null;

  return (
    <div className={styles.linkList}>
      <If condition={linkedList.length === 0}>
        <Empty description="暂无连接" />
      </If>
      {linkedList.map((card) => (
        <CardItem2
          onClick={() => {
            onClickLinkCard(card);
          }}
          card={card}
          key={card.id}
          showTags
          maxRows={4}
          settings={[
            {
              title: "删除连接",
              onClick: onRemoveLink,
            },
          ]}
        />
      ))}
      <Button onClick={openAddLinkModal} style={{ marginLeft: "auto" }}>
        添加卡片
      </Button>
      <AddCardLinkModal
        open={addLinkModalOpen}
        onClose={() => {
          setAddLinkModalOpen(false);
        }}
        onOk={async (selectedCards) => {
          addLinks(selectedCards.map((card) => card.id));
          setAddLinkModalOpen(false);
        }}
        editingCard={editingCard}
      />
    </div>
  );
};

export default LinkList;
