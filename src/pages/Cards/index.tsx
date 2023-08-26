import {useEffect, useMemo, useState, useRef, useCallback, memo} from "react";
import {Button, Input, Modal, Skeleton, Spin} from 'antd';
import isHotKey from "is-hotkey";
import { CloseOutlined } from '@ant-design/icons';

import Tags from "@/components/Tags";
import ErrorBoundary from "@/components/ErrorBoundary";
import WidthResizable from "@/components/WidthResizable";
import useCardsManagementStore from "@/hooks/useCardsManagementStore";
import useEditCardStore from "@/hooks/useEditCardStore.ts";
import { CREATE_CARD_ID } from "@/constants";

import CardItem from "./CardItem";
import CardDetail, {CardDetailRef} from './CardDetail';
import AddCardLinkModal from "./AddCardLinkModal";

import styles from './index.module.less';

const Cards = memo(() => {
  const {
    cards,
    init,
    loading,
    deleteCard,
  } = useCardsManagementStore((state) => ({
    cards: state.cards,
    init: state.init,
    loading: state.initLoading,
    deleteCard: state.deleteCard,
  }));
  
  const {
    editingCardId,                                                                  
  } = useEditCardStore((state) => ({
      editingCardId: state.editingCardId,
  }));

  const [searchValue, setSearchValue] = useState<string>('');
  const [searchTags, setSearchTags] = useState<string[]>([]);
  const [isInputFocus, setIsInputFocus] = useState<boolean>(false);
  const [searchTips, setSearchTips] = useState<string[]>(() => {
    const tips = localStorage.getItem('searchTips');
    if (tips) return JSON.parse(tips);
    return [];
  });
  const [showSearchTips, setShowSearchTips] = useState<boolean>(false);
  const [cardCount, setCardCount] = useState<number>(20);
  const [defaultSidebarWidth, setDefaultSidebarWidth] = useState<number>(() => {
    const width = localStorage.getItem('default-sidebar-width');
    if (width) return Number(width);
    return 300;
  });
  const loaderRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cardDetailRef = useRef<CardDetailRef>(null);

  const filterCards = useMemo(() => {
    if (searchTags.length === 0) return cards;
    return cards.filter(card => {
      return searchTags.every(t => card.tags.some(tag => tag.toLowerCase().includes(t.toLowerCase())));
    })
  }, [cards, searchTags]);

  const loadMore = useCallback(() => {
    if (loading) return;
    setCardCount(Math.min(cardCount + 20, filterCards.length));
  }, [loading, cardCount, filterCards]);

  const scrollToTop = () => {
    if (listRef.current) {
      listRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
      setCardCount(20);
    }
  }

  const onSearch = () => {
    if (searchValue === '') return;
    setSearchTags([...new Set([...searchTags, searchValue])]);
    setSearchValue('');
    const tips = [...new Set([searchValue, ...searchTips].slice(0, 10))];
    setSearchTips(tips);
    localStorage.setItem('searchTips', JSON.stringify(tips));
    setShowSearchTips(false);
    scrollToTop();
  }

  const createCard = () => {
    useEditCardStore.setState({
      editingCardId: CREATE_CARD_ID,
      readonly: false,
    })
  }

  const deleteTag = (tag: string) => {
    setSearchTags(searchTags.filter(t => t !== tag));
    setShowSearchTips(false);
    scrollToTop();
  }

  const onClickSearchTag = (tag: string) => {
    setSearchTags([...new Set([...searchTags, tag])]);
    setShowSearchTips(false);
    scrollToTop();
  }

  const handleFocus = () => {
    setIsInputFocus(true);
    setShowSearchTips(true);
  }

  const handleBlur = () => {
    setIsInputFocus(false);
    // 因为点击搜索记录中的 tag 的时候会失焦，搜索记录面板会立即消失，无法点击
    // 因此延时 100 ms 消失，使得点击搜索记录面板上的 tag 时，先触发 onClickSearchTag，再消失
    setTimeout(() => {
      setShowSearchTips(false);
    }, 100);
  }

  const handleClickCard = (id: number) => {
    if (!editingCardId) {
      useEditCardStore.setState({
        editingCardId: id,
      })
      return;
    }

    if (id === editingCardId) {
      cardDetailRef.current?.quit();
      return;
    }
    cardDetailRef.current?.quit().then(() => {
      useEditCardStore.setState({
        editingCardId: id,
      })
    });
  }

  const onResize = (width: number) => {
    setDefaultSidebarWidth(width);
    localStorage.setItem('default-sidebar-width', String(width));
  }

  const onDeleteCard = async (id: number) => {
    Modal.confirm({
      title: '确认删除？',
      content: '删除后无法恢复',
      onOk: async () => {
        await deleteCard(id);
        if (editingCardId === id) {
          useEditCardStore.setState({
            editingCardId: undefined,
          })
        }
      },
      okText: '确认',
      cancelText: '取消',
      okButtonProps: {
        danger: true
      }
    });
  }

  useEffect(() => {
    init().then();
  }, [init]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotKey('escape', e)) {
        setShowSearchTips(false);
      } else if (isHotKey('backspace', e) && searchValue === '' && isInputFocus) {
        setSearchTags(searchTags.slice(0, -1));
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isInputFocus, searchTags, searchValue]);
  
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        loadMore();
      }
    });
    const loader = loaderRef.current;
    if (loader) {
      observer.observe(loader);
    }
    return () => {
      if (loader) {
        observer.unobserve(loader);
      }
    }
  }, [loadMore]);

  return (
    <div className={styles.cardsContainer}>
      <WidthResizable
        defaultWidth={defaultSidebarWidth}
        minWidth={300}
        maxWidth={500}
        onResize={onResize}
      >
        <div className={styles.sidebar}>
          <div className={styles.header}>
            <div className={styles.total}>
              <div className={styles.number}>卡片数量：{filterCards.length}</div>
              <div className={styles.create} onClick={createCard}>
                <Button>新建卡片</Button>
              </div>
            </div>
            <div className={styles.input}>
              <Input
                prefix={searchTags.length > 0 ? <Tags closable tags={searchTags} onClose={deleteTag} /> : undefined}
                onPressEnter={onSearch}
                value={searchValue}
                onChange={(e) => { setSearchValue(e.target.value) }}
                placeholder="输入标签进行筛选"
                onFocus={handleFocus}
                onBlur={handleBlur}
              />
              {
                showSearchTips &&
                <div className={styles.searchTips}>
                  <div className={styles.searchHeader}>
                    <div className={styles.title}>搜索记录</div>
                    <CloseOutlined onClick={() => { setShowSearchTips(false) }} />
                  </div>
                  <Tags onClick={onClickSearchTag} tags={searchTips} noWrap />
                </div>
              }
            </div>
          </div>
          <div ref={listRef} className={styles.cardList}>
            {
              loading
                ? Array.from({ length: 20 }).map((_, index) => (
                  <Skeleton key={index} active />
                ))
                : filterCards.slice(0, cardCount).map((card) => (
                  <ErrorBoundary key={card.id}>
                    <CardItem
                      active={card.id === editingCardId}
                      card={card}
                      onClick={(e) => {
                        handleClickCard(card.id);
                        e.stopPropagation();
                      }}
                      onDelete={(e) => {
                        onDeleteCard(card.id)
                        e.stopPropagation();
                      }}
                    />
                  </ErrorBoundary>
                ))
            }
            {
              cardCount < filterCards.length && !loading &&
              <Spin>
                <div ref={loaderRef} style={{ height: 100 }} />
              </Spin>
            }
          </div>
        </div>
      </WidthResizable>
      <div className={styles.content}>
        {
          editingCardId &&
          <CardDetail ref={cardDetailRef} />
        }
      </div>
      <AddCardLinkModal />
    </div>
  )
})

export default Cards;
