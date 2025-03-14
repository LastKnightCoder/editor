import { useRef, useState } from "react";
import { Button, Empty, Input, Modal, Spin, Tooltip, Typography } from "antd";
import { UpOutlined } from "@ant-design/icons";

import { WhiteBoard } from "@/types";

import Tags from "@/components/Tags";
import WhiteBoardItem from "./WhiteBoardItem";

import { useMemoizedFn } from "ahooks";
import useSearch from "./hooks/useSearch";

import styles from "./index.module.less";
import If from "@/components/If";

const { Title } = Typography;

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
  const observerRef = useRef<IntersectionObserver>();

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

  const handleOk = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMaxWhiteBoardCount(20);
    if (!onOk || !selectedWhiteBoards) return;
    await onOk(selectedWhiteBoards);
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMaxWhiteBoardCount(20);
    clear();
    if (!onCancel) return;
    onCancel();
  };

  const onAddWhiteBoard = (whiteBoard: WhiteBoard) => {
    if (!onChange) return;
    if (multiple) {
      if (selectedWhiteBoards.some((item) => item.id === whiteBoard.id)) {
        return;
      }
      onChange([...selectedWhiteBoards, whiteBoard]);
    } else {
      onChange([whiteBoard]);
    }
  };

  const onDeleteSelectedWhiteBoard = (whiteBoard: WhiteBoard) => {
    if (!onChange) return;
    onChange(
      selectedWhiteBoards.filter(
        (selectedWhiteBoard) => selectedWhiteBoard.id !== whiteBoard.id,
      ),
    );
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
    <Modal
      title={title || "选择关联白板"}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      width={800}
      styles={{
        body: {
          height: 500,
          boxSizing: "border-box",
          padding: "16px 24px",
        },
      }}
    >
      <div className={styles.modal}>
        <div className={styles.sidebar}>
          <div className={styles.headers}>
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
              placeholder={"请输入标签进行筛选"}
            />
            <Tooltip title={"回到顶部"}>
              <Button
                className={styles.btn}
                icon={<UpOutlined />}
                onClick={scrollToTop}
              ></Button>
            </Tooltip>
          </div>
          <div ref={listRef} className={styles.whiteBoardList}>
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
                  />
                ))
            ) : (
              <Empty description="暂无白板" />
            )}
            <If condition={maxWhiteBoardCount < searchedWhiteBoards.length}>
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
            </If>
          </div>
        </div>
        <div className={styles.selectPanel}>
          <Title level={5} style={{ margin: "0 0 12px 0" }}>
            已选白板{multiple ? "（多选）" : "（单选）"}
          </Title>
          {selectedWhiteBoards.length > 0 ? (
            selectedWhiteBoards.map((whiteBoard) => (
              <WhiteBoardItem
                key={whiteBoard.id}
                whiteBoard={whiteBoard}
                onDelete={() => {
                  onDeleteSelectedWhiteBoard(whiteBoard);
                }}
              />
            ))
          ) : (
            <Empty
              description="请从左侧选择白板"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};

export default SelectWhiteBoardModal;
