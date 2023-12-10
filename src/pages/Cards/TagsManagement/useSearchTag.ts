import { useEffect, useState } from "react";
import { ICard } from "@/types";
import isHotKey from "is-hotkey";
import { useMemoizedFn } from "ahooks";

const useSearchTag = (tagGroup: Array<{ tag: string, cards: ICard[] }>) => {
  const [searchValue, setSearchValue] = useState<string>('');
  const [searchTags, setSearchTags] = useState<string[]>([]);
  const [isInputFocus, setIsInputFocus] = useState<boolean>(false);

  const filterGroups = tagGroup.filter(group => {
    return searchTags.every(t => group.tag.toLowerCase().includes(t.toLowerCase()));
  })

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isHotKey('backspace', e) && searchValue === '' && isInputFocus) {
        setSearchTags(searchTags.slice(0, -1));
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isInputFocus, searchTags, searchValue]);

  const onSearch = useMemoizedFn(() => {
    if (searchValue === '') return;
    setSearchTags([...new Set([...searchTags, searchValue])]);
    setSearchValue('');
  });

  const onDeleteTag = useMemoizedFn((tag: string) => {
    setSearchTags(searchTags.filter(t => t !== tag));
  });

  const onFocus = useMemoizedFn(() => {
    setIsInputFocus(true);
  });

  const onBlur = useMemoizedFn(() => {
    setIsInputFocus(false);
  });

  const onValueChange = useMemoizedFn((value: string) => {
    setSearchValue(value);
  });

  return {
    searchValue,
    searchTags,
    isInputFocus,
    filterGroups,
    onFocus,
    onBlur,
    onValueChange,
    onSearch,
    onDeleteTag,
  }
}

export default useSearchTag;