import { useRef, useState } from "react";
import { Empty, Spin } from "antd";

import { WhiteBoard } from "@/types";

import Tags from "@/components/Tags";
import WhiteBoardItem from "./WhiteBoardItem";

import { useMemoizedFn } from "ahooks";
import useSearch from "./hooks/useSearch";

import If from "@/components/If";
import CustomModal from "@/components/CustomModal";

interface ISelectWhiteBoardModalProps {
  open: boolean;
  title?: string;
  multiple?: boolean;
  onCancel?: () => void;
  onChange?: (whiteBoards: WhiteBoard[]) => void;
  onOk?: (whiteBoards: WhiteBoard[]) => Promise<void>;
  excludeWhiteBoardIds?: number[];
  selectedWhiteBoards?: WhiteBoard[];
  allWhiteBoards: WhiteBoard[];
}

const SelectWhiteBoardModal = (props: ISelectWhiteBoardModalProps) => {
  const {
    open,
    multiple = false,
    title,
    onCancel,
    onChange,
    onOk,
    excludeWhiteBoardIds = [],
    selectedWhiteBoards = [],
    allWhiteBoards = [],
  } = props;

  const [maxWhiteBoardCount, setMaxWhiteBoardCount] = useState<number>(20);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const loadMore = useMemoizedFn(() => {
    setMaxWhiteBoardCount((maxWhiteBoardCount) =>
      Math.min(maxWhiteBoardCount + 20, searchedWhiteBoards.length),
    );
  });

  const {
    searchValue,
    onSearchValueChange,
    tags,
    onDeleteTag,
    onDeleteLastTag,
    onSearch,
    searchedWhiteBoards,
    clear,
  } = useSearch(allWhiteBoards, [
    ...excludeWhiteBoardIds,
    ...selectedWhiteBoards.map((whiteBoard) => whiteBoard.id),
  ]);

  const handleOk = async () => {
    setMaxWhiteBoardCount(20);
    if (!onOk || !selectedWhiteBoards) return;
    await onOk(selectedWhiteBoards);
  };

  const handleCancel = () => {
    setMaxWhiteBoardCount(20);
    clear();
    if (!onCancel) return;
    onCancel();
  };

  const onAddWhiteBoard = (whiteBoard: WhiteBoard) => {
    if (!onChange) return;
    if (multiple) {
      if (selectedWhiteBoards.some((item) => item.id === whiteBoard.id)) {
        // 取消选中
        onChange(
          selectedWhiteBoards.filter((item) => item.id !== whiteBoard.id),
        );
      } else {
        // 添加选中
        onChange([...selectedWhiteBoards, whiteBoard]);
      }
    } else {
      onChange([whiteBoard]);
    }
  };

  return (
    <CustomModal
      title={title || "选择关联白板"}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okButtonProps={{ disabled: selectedWhiteBoards.length === 0 }}
      width={1200}
      contentClassName="p-0 h-[min(760px,calc(100vh-120px))]"
      bodyClassName="flex-1 min-h-0 box-border px-6 py-4"
    >
      <div className="flex flex-col h-full gap-4">
        {/* 搜索栏 */}
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-all bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-slate-700 shadow-inner focus-within:border-blue-500 focus-within:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(59,130,246,0.15)] dark:focus-within:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(59,130,246,0.25)]">
          {tags.length > 0 && (
            <Tags closable tags={tags} onClose={onDeleteTag} />
          )}
          <input
            value={searchValue}
            onChange={(e) => onSearchValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSearch();
              } else if (
                e.key === "Backspace" &&
                !searchValue &&
                tags.length > 0
              ) {
                onDeleteLastTag();
              }
            }}
            placeholder="请输入名称、描述或标签进行搜索"
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500"
          />
        </div>

        {/* 选中提示 */}
        <If condition={selectedWhiteBoards.length > 0}>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            已选择{" "}
            <span className="text-blue-500 font-semibold">
              {selectedWhiteBoards.length}
            </span>{" "}
            个白板
            {multiple && <span className="ml-2 text-gray-500">（多选）</span>}
          </div>
        </If>

        {/* Grid 布局白板列表 */}
        <div
          className="flex-1 min-h-0 overflow-y-auto p-5"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "20px",
            alignContent: "flex-start",
          }}
        >
          {searchedWhiteBoards.slice(0, maxWhiteBoardCount).length > 0 ? (
            searchedWhiteBoards
              .slice(0, maxWhiteBoardCount)
              .map((whiteBoard) => (
                <WhiteBoardItem
                  onClick={() => {
                    onAddWhiteBoard(whiteBoard);
                  }}
                  key={whiteBoard.id}
                  whiteBoard={whiteBoard}
                  active={selectedWhiteBoards.some(
                    (item) => item.id === whiteBoard.id,
                  )}
                  showDelete={false}
                />
              ))
          ) : (
            <div className="col-span-full flex items-center justify-center py-20">
              <Empty description="暂无白板" />
            </div>
          )}
          <If condition={maxWhiteBoardCount < searchedWhiteBoards.length}>
            <div className="col-span-full">
              <Spin>
                <div
                  ref={(node) => {
                    if (node) {
                      if (observerRef.current) {
                        observerRef.current.disconnect();
                      }
                      observerRef.current = new IntersectionObserver(
                        (entries) => {
                          if (entries[0].isIntersecting) {
                            loadMore();
                          }
                        },
                      );
                      observerRef.current.observe(node);
                    }
                  }}
                  style={{ height: 100 }}
                />
              </Spin>
            </div>
          </If>
        </div>
      </div>
    </CustomModal>
  );
};

export default SelectWhiteBoardModal;
