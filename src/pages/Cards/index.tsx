import {useEffect, useMemo, useState} from "react";
import {Button, Input, Skeleton} from 'antd';
import { useNavigate } from 'react-router-dom';
import isHotKey from "is-hotkey";
import { CloseOutlined } from '@ant-design/icons';

import ErrorBoundary from "@/components/ErrorBoundary";
import useEditorSourceValueStore from "@/hooks/useEditorSourceValueStore.ts";
import useCardsManagementStore from "@/hooks/useCardsManagementStore";

import EditorSourceValue from "@/components/EditorSourceValue";
import Tags from "@/components/Tags";

import CardItem from "./CardItem";
import styles from './index.module.less';

const Cards = () => {
  const {
    cards,
    init,
    loading,
  } = useCardsManagementStore((state) => ({
    cards: state.cards,
    init: state.init,
    loading: state.initLoading,
  }));

  const {
    sourceViewOpen,
    close,
    content,
  } = useEditorSourceValueStore((state) => ({
    sourceViewOpen: state.isOpen,
    close: state.close,
    content: state.content,
  }));

  const [searchValue, setSearchValue] = useState<string>('');
  const [searchTags, setSearchTags] = useState<string[]>([]);
  const [isInputFocus, setIsInputFocus] = useState<boolean>(false);
  const [isFirstInit, setIsFirstInit] = useState<boolean>(true);
  const [searchTips, setSearchTips] = useState<string[]>(() => {
    const tips = localStorage.getItem('searchTips');
    if (tips) return JSON.parse(tips);
    return [];
  });
  const [showSearchTips, setShowSearchTips] = useState<boolean>(false);

  const navigate = useNavigate();

  const filterCards = useMemo(() => {
    if (searchTags.length === 0) return cards;
    return cards.filter(card => {
      return searchTags.every(t => card.tags.some(tag => tag.toLowerCase().includes(t.toLowerCase())));
    })
  }, [cards, searchTags]);

  const onSearch = () => {
    if (searchValue === '') return;
    setSearchTags([...new Set([...searchTags, searchValue])]);
    setSearchValue('');
    const tips = [...new Set([searchValue, ...searchTips].slice(0, 10))];
    setSearchTips(tips);
    localStorage.setItem('searchTips', JSON.stringify(tips));
  }

  const createCard = () => {
    navigate('/cards/detail')
  }

  const deleteTag = (tag: string) => {
    setSearchTags(searchTags.filter(t => t !== tag));
    setShowSearchTips(false);
  }

  const onClickSearchTag = (tag: string) => {
    setSearchTags([...new Set([...searchTags, tag])]);
    setShowSearchTips(false);
  }

  const handleFocus = () => {
    setIsInputFocus(true);
    if (isFirstInit) {
      setIsFirstInit(false);
    } else {
      setShowSearchTips(true);
    }
  }

  const handleBlur = () => {
    setIsInputFocus(false);
    // 因为点击搜索记录中的 tag 的时候会失焦，搜索记录面板会立即消失，无法点击
    // 因此延时 100 ms 消失，使得点击搜索记录面板上的 tag 时，先触发 onClickSearchTag，再消失
    setTimeout(() => {
      setShowSearchTips(false);
    }, 100);
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

  return (
    <div className={styles.cardsManagement}>
      <div className={styles.header}>
        <div className={styles.count}>
          总数：{filterCards.length}
        </div>
        <div className={styles.input}>
          <Input
            style={{ width: 400 }}
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
        <Button className={styles.addCard} onClick={createCard}>新建卡片</Button>
      </div>
      <div className={styles.cardList}>
        {
          loading
            ? Array.from({ length: 20 }).map((_, index) => (
              <Skeleton key={index} active />
            ))
            : filterCards.slice(searchTags.length > 0 ? -100 : -40).reverse().map((card) => (
              <ErrorBoundary key={card.id}>
                <CardItem card={card} />
              </ErrorBoundary>
            ))
        }
      </div>
      <EditorSourceValue open={sourceViewOpen} onClose={close} content={content} />
    </div>
  )
}

export default Cards;
