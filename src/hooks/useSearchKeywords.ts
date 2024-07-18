import { useRef, useState, useEffect } from "react";
import { useMemoizedFn } from "ahooks";
import { InputRef } from "antd";

const useSearchKeywords = () => {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState<string>('');
  const isFocus = useRef(false);
  const inputRef = useRef<InputRef>(null);
  
  useEffect(() => {
    const handleDelete = (e: KeyboardEvent) => {
      if (e.key === 'Backspace' && !searchValue && isFocus.current) {
        setKeywords((keywords) => keywords.slice(0, -1));
        setTimeout(() => {
          inputRef.current?.focus();
        }, 20)
      }
    }
    document.addEventListener('keydown', handleDelete);
    return () => {
      document.removeEventListener('keydown', handleDelete);
    }
  }, [searchValue]);

  const handleValueChange = useMemoizedFn((value: string) => {
    setSearchValue(value);
  })
  const handleFocus = useMemoizedFn(() => {
    isFocus.current = true;
  })
  const handleBlur = useMemoizedFn(() => {
    isFocus.current = false;
  })

  const handleDeleteKeyword = useMemoizedFn((keyword: string) => {
    setKeywords((keywords) => keywords.filter((item) => item !== keyword));
  });

  const handleAddKeyword = useMemoizedFn(() => {
    if (searchValue && !keywords.includes(searchValue)) {
      setKeywords((keywords) => [...keywords, searchValue]);
      setSearchValue('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 20)
    }
  });
  
  return {
    inputRef,
    keywords,
    searchValue,
    handleValueChange,
    handleFocus,
    handleBlur,
    handleDeleteKeyword,
    handleAddKeyword,
  }
}

export default useSearchKeywords;
