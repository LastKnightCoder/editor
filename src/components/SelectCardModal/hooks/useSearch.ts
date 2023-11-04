import { useState, useMemo } from "react";

import { findCardsByTags, excludeCards } from "@/utils/card.ts";

import { ICard } from "@/types";

const useSearch = (cards: ICard[], excludeCardIds: number[]) => {
  const [searchValue, setSearchValue] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  
  const searchedCards = useMemo(() => {
    return excludeCards(findCardsByTags(cards, tags), excludeCardIds);
  }, [cards, tags, excludeCardIds]);
  
  const onSearchValueChange = (value: string) => {
    setSearchValue(value);
  }
  
  const onSearch = () => {
    setTags([...tags, searchValue]);
    setSearchValue('');
  }
  
  const onDeleteTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  }
  
  const onDeleteLastTag = () => {
    setTags(tags.slice(0, tags.length - 1));
  }

  const clear = () => {
    setTags([]);
    setSearchValue('');
  }
  
  return {
    searchValue,
    tags,
    onSearchValueChange,
    onSearch,
    searchedCards,
    onDeleteTag,
    onDeleteLastTag,
    clear,
  }
}

export default useSearch;
