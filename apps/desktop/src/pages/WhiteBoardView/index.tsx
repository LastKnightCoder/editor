import { useState, memo } from "react";
import { useShallow } from "zustand/react/shallow";
import { Empty, Button } from "antd";
import classnames from "classnames";
import useWhiteBoardStore from "@/stores/useWhiteBoardStore.ts";
import { useMemoizedFn } from "ahooks";
import WhiteBoardModal from "@/components/WhiteBoardModal";
import WhiteBoardList from "./WhiteBoardList";

import { PlusOutlined } from "@ant-design/icons";

import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import { WhiteBoard } from "@/types";

import styles from "./index.module.less";

const WhiteBoardView = memo(() => {
  const { whiteBoards, createWhiteBoard, initData } = useWhiteBoardStore(
    useShallow((state) => ({
      whiteBoards: state.whiteBoards,
      createWhiteBoard: state.createWhiteBoard,
      initData: state.initWhiteBoards,
    })),
  );

  // 在数据库连接或切换时加载白板数据
  useDatabaseChangeEffect(() => {
    initData();
  });

  const navigateTo = useTabStore((state) => state.navigateTo);

  const [createWhiteBoardModalOpen, setCreateWhiteBoardModalOpen] =
    useState(false);

  const onClick = useMemoizedFn((whiteBoard: WhiteBoard) => {
    navigateTo(
      TabType.WhiteBoardDetail,
      { type: "whiteboard", id: whiteBoard.id },
      `白板 - ${whiteBoard.title || `#${whiteBoard.id}`}`,
    );
  });

  const handleCreateWhiteBoard = async (
    title: string,
    description: string,
    snapshot?: string,
  ) => {
    const createWhiteBoardData = {
      title,
      description,
      tags: [],
      whiteBoardContentList: [
        {
          name: title,
          data: {
            children: [],
            viewPort: {
              zoom: 1,
              minX: 0,
              minY: 0,
              width: 0,
              height: 0,
            },
            selection: {
              selectArea: null,
              selectedElements: [],
            },
            presentationSequences: [],
          },
        },
      ],
      snapshot: snapshot || "",
    };

    const whiteBoard = await createWhiteBoard(createWhiteBoardData);
    setCreateWhiteBoardModalOpen(false);
    navigateTo(
      TabType.WhiteBoardDetail,
      { type: "whiteboard", id: whiteBoard.id },
      `白板 - ${whiteBoard.title || `#${whiteBoard.id}`}`,
    );
  };

  if (whiteBoards.length === 0) {
    return (
      <div className={styles.empty}>
        <Empty description="暂无白板">
          <Button onClick={() => setCreateWhiteBoardModalOpen(true)}>
            新建白板
          </Button>
        </Empty>
        <WhiteBoardModal
          open={createWhiteBoardModalOpen}
          onCancel={() => setCreateWhiteBoardModalOpen(false)}
          onOk={handleCreateWhiteBoard}
          modalTitle="新建白板"
          okText="创建"
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={classnames(styles.viewContainer)}>
        <WhiteBoardList whiteBoards={whiteBoards} onClick={onClick} />
        <button
          type="button"
          className={styles.addActionButton}
          aria-label="新建白板"
          onClick={() => {
            setCreateWhiteBoardModalOpen(true);
          }}
        >
          <PlusOutlined />
        </button>
        <WhiteBoardModal
          open={createWhiteBoardModalOpen}
          onCancel={() => setCreateWhiteBoardModalOpen(false)}
          onOk={handleCreateWhiteBoard}
          modalTitle="新建白板"
          okText="创建"
        />
      </div>
    </div>
  );
});

export default WhiteBoardView;
