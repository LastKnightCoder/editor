import { useState, useMemo } from "react";
import { WhiteBoard } from "@/types";

// 根据标签筛选白板
const findWhiteBoardsByTags = (
  whiteBoards: WhiteBoard[],
  tags: string[],
): WhiteBoard[] => {
  if (tags.length === 0) return whiteBoards;
  return whiteBoards.filter((whiteBoard) => {
    return tags.every((tag) => {
      // 标题或描述中包含标签
      return (
        whiteBoard.title.toLowerCase().includes(tag.toLowerCase()) ||
        whiteBoard.description.toLowerCase().includes(tag.toLowerCase()) ||
        whiteBoard.tags.some((t) => t.toLowerCase().includes(tag.toLowerCase()))
      );
    });
  });
};

// 排除已选择的白板
const excludeWhiteBoards = (
  whiteBoards: WhiteBoard[],
  excludeWhiteBoardIds: number[],
): WhiteBoard[] => {
  if (excludeWhiteBoardIds.length === 0) return whiteBoards;
  return whiteBoards.filter(
    (whiteBoard) => !excludeWhiteBoardIds.includes(whiteBoard.id),
  );
};

const useSearch = (
  whiteBoards: WhiteBoard[],
  excludeWhiteBoardIds: number[],
) => {
  const [searchValue, setSearchValue] = useState<string>("");
  const [tags, setTags] = useState<string[]>([]);

  const searchedWhiteBoards = useMemo(() => {
    return excludeWhiteBoards(
      findWhiteBoardsByTags(whiteBoards, tags),
      excludeWhiteBoardIds,
    );
  }, [whiteBoards, tags, excludeWhiteBoardIds]);

  const onSearchValueChange = (value: string) => {
    setSearchValue(value);
  };

  const onSearch = () => {
    if (!searchValue.trim()) return;
    setTags([...tags, searchValue.trim()]);
    setSearchValue("");
  };

  const onDeleteTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const onDeleteLastTag = () => {
    setTags(tags.slice(0, tags.length - 1));
  };

  const clear = () => {
    setTags([]);
    setSearchValue("");
  };

  return {
    searchValue,
    tags,
    onSearchValueChange,
    onSearch,
    searchedWhiteBoards,
    onDeleteTag,
    onDeleteLastTag,
    clear,
  };
};

export default useSearch;
