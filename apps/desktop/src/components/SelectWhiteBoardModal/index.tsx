import { useRef, useState } from "react";
import { Button, Empty, Input, Spin, Tooltip } from "antd";
import { UpOutlined } from "@ant-design/icons";

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
  const listRef = useRef<HTMLDivElement>(null);
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

  const scrollToTop = () => {
    if (listRef.current) {
      listRef.current.scrollTo({
        top: 0,
        behavior: "smooth",
      });
      setMaxWhiteBoardCount(Math.min(20, searchedWhiteBoards.length));
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
      contentClassName="p-0"
      bodyClassName="h-[600px] box-border px-6 py-4"
    >
      <div className="flex flex-col h-full gap-4">
        {/* 搜索栏 */}
        <div className="flex gap-2 items-center">
          <Input
            value={searchValue}
            prefix={
              tags.length > 0 ? (
                <Tags closable tags={tags} onClose={onDeleteTag} />
              ) : undefined
            }
            onChange={(e) => {
              onSearchValueChange(e.target.value);
            }}
            onPressEnter={onSearch}
            placeholder={"请输入名称、描述或标签进行搜索"}
          />
          <Tooltip title={"回到顶部"}>
            <Button
              className="shrink-0"
              icon={<UpOutlined />}
              onClick={scrollToTop}
            ></Button>
          </Tooltip>
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
          ref={listRef}
          className="flex-1 overflow-y-auto p-5"
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
