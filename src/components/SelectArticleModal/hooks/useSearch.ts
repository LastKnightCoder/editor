import { IItem } from "../index.tsx";
import { useMemo, useState } from "react";
import { useMemoizedFn } from "ahooks";

interface SearchProps<T extends IItem> {
  allItems: T[];
  excludeIds: number[];
}

const useSearch = <T extends IItem>(props: SearchProps<T>) => {
  const { allItems, excludeIds } = props;
  const [searchValue, setSearchValue] = useState<string>('');

  const searchedItems = useMemo(() => {
    if (searchValue === '') return allItems;

    return allItems
      .filter(item => item.title.includes(searchValue))
      .filter(item => !excludeIds.includes(item.id));
  }, [allItems, excludeIds, searchValue]);

  const onSearchValueChange = useMemoizedFn((value: string) => {
    setSearchValue(value);
  });

  return {
    searchValue,
    onSearchValueChange,
    searchedItems,
  }
}

export default useSearch;
