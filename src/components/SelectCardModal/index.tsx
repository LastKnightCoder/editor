import { useRef, useState } from 'react';
import { Button, Empty, Input, Modal, Spin, Tooltip } from "antd";
import { UpOutlined } from "@ant-design/icons";

import { ICard } from "@/types";

import Tags from "@/components/Tags";
import CardItem from "@/pages/Cards/CardItem";
import CardItem2 from "@/pages/Cards/CardItem2";

import { useMemoizedFn } from "ahooks";
import useSearch from "./hooks/useSearch";

import styles from "./index.module.less";
import If from "@/components/If";

interface ISelectCardModalProps {
  open: boolean;
  title?: string;
  multiple?: boolean;
  onCancel?: () => void;
  onChange?: (cards: ICard[]) => void;
  onOk?: (cards: ICard[]) => Promise<void>;
  excludeCardIds?: number[];
  selectedCards?: ICard[];
  allCards: ICard[];
}

const SelectCardModal = (props: ISelectCardModalProps) => {
  const {
    open,
    multiple = false,
    title,
    onCancel,
    onChange,
    onOk,
    excludeCardIds = [],
    selectedCards = [],
    allCards = [],
  } = props;

  const [maxCardCount, setMaxCardCount] = useState<number>(20);
  const listRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver>();

  const loadMore = useMemoizedFn(() => {
    setMaxCardCount(maxCardCount => Math.min(maxCardCount + 20, searchedCards.length));
  });

  const {
    searchValue,
    onSearchValueChange,
    tags,
    onDeleteTag,
    onSearch,
    searchedCards,
    clear,
  } = useSearch(allCards, [...excludeCardIds, ...selectedCards.map(card => card.id)]);

  const handleOk = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMaxCardCount(20);
    if (!onOk || !selectedCards) return;
    await onOk(selectedCards);
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMaxCardCount(20);
    clear();
    if (!onCancel) return;
    onCancel();
  }

  const onAddCard = (card: ICard) => {
    if (!onChange) return;
    if (multiple) {
      onChange([...selectedCards, card]);
    } else {
      onChange([card]);
    }
  }

  const onDeleteSelectedCard = (card: ICard) => {
    if (!onChange) return;
    onChange(selectedCards.filter(selectedCard => selectedCard.id !== card.id));
  }

  const scrollToTop = () => {
    if (listRef.current) {
      listRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
      setMaxCardCount(Math.min(20, searchedCards.length));
    }
  }

  return (
    <Modal
      title={title || '添加相关卡片'}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      width={800}
      bodyStyle={{
        height: 500,
        boxSizing: 'border-box',
      }}
    >
      <div className={styles.modal}>
        <div className={styles.sidebar}>
          <div className={styles.headers}>
            <Input
              value={searchValue}
              prefix={tags.length > 0 ? <Tags closable tags={tags} onClose={onDeleteTag} /> : undefined}
              onChange={(e) => { onSearchValueChange(e.target.value) }}
              onPressEnter={onSearch}
              placeholder={'请输入标签进行筛选'}
            />
            <Tooltip title={'回到顶部'}>
              <Button className={styles.btn} icon={<UpOutlined />} onClick={scrollToTop}></Button>
            </Tooltip>
          </div>
          <div ref={listRef} className={styles.cardList}>
            {
              searchedCards.slice(0, maxCardCount).length > 0
                ? searchedCards.slice(0, maxCardCount).map(card => (<CardItem2 showTags maxRows={4} onClick={() => { onAddCard(card) }} key={card.id} card={card} />))
                : <Empty />
            }
            <If condition={maxCardCount < searchedCards.length}>
              <Spin>
                <div
                  ref={(node) => {
                    if (node) {
                      if (observerRef.current) {
                        observerRef.current.disconnect();
                      }
                      observerRef.current = new IntersectionObserver((entries) => {
                        if (entries[0].isIntersecting) {
                          loadMore();
                        }
                      });
                      observerRef.current.observe(node);
                    }
                  }}
                  style={{ height: 100 }}
                />
              </Spin>
            </If>
          </div>
        </div>
        <div className={styles.selectPanel}>
          <div style={{ fontWeight: 700 }}>已选卡片：</div>
          {
            selectedCards.map(card => (
              <CardItem key={card.id} card={card} onDelete={() => { onDeleteSelectedCard(card) }} />
            ))
          }
        </div>
      </div>
    </Modal>
  )
}

export default SelectCardModal;