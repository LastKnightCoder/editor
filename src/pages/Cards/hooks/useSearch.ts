import { useEffect, useMemo, useState } from "react";
import { ICard } from "@/types";
import isHotKey from "is-hotkey";

const useSearch = (cards: ICard[], scrollToTop: () => void) => {
  const [searchValue, setSearchValue] = useState<string>('');
  const [searchTags, setSearchTags] = useState<string[]>([]);
  const [isInputFocus, setIsInputFocus] = useState<boolean>(false);
  const [searchTips, setSearchTips] = useState<string[]>(() => {
    const tips = localStorage.getItem('searchTips');
    if (tips) return JSON.parse(tips);
    return [];
  });
  const [showSearchTips, setShowSearchTips] = useState<boolean>(false);

  const filterCards = useMemo(() => {
    if (searchTags.length === 0) return cards;
    return cards.filter(card => {
      return searchTags.every(t => card.tags.some(tag => tag.toLowerCase().includes(t.toLowerCase())));
    })
  }, [cards, searchTags]);

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

  return {
    searchValue,
    setSearchValue,
    searchTags,
    searchTips,
    setShowSearchTips,
    showSearchTips,
    filterCards,
    onSearch,
    onClickSearchTag,
    deleteTag,
    handleFocus,
    handleBlur,
  }
}

export default useSearch;