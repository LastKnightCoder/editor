import { useState, memo, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { Breadcrumb, FloatButton, Empty, Button } from "antd";
import classnames from "classnames";
import useWhiteBoardStore from "@/stores/useWhiteBoardStore.ts";
import { useMemoizedFn } from "ahooks";
import For from "@/components/For";
import WhiteBoardCard from "./WhiteBoardCard";
import WhiteBoardModal from "./WhiteBoardModal";

import { PlusOutlined } from "@ant-design/icons";

import styles from "./index.module.less";
import useGridLayout from "@/hooks/useGridLayout";
import Titlebar from "@/components/Titlebar";
import useSettingStore from "@/stores/useSettingStore";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";

const WhiteBoardView = memo(() => {
  const { gridContainerRef, itemWidth, gap } = useGridLayout();

  const { whiteBoards, createWhiteBoard, initData } = useWhiteBoardStore(
    useShallow((state) => ({
      whiteBoards: state.whiteBoards,
      createWhiteBoard: state.createWhiteBoard,
      initData: state.initWhiteBoards,
    })),
  );

  const isConnected = useDatabaseConnected();
  const active = useSettingStore((state) => state.setting.database.active);

  useEffect(() => {
    if (isConnected && active) {
      initData();
    }
  }, [isConnected, active, initData]);

  const navigate = useNavigate();

  const [createWhiteBoardModalOpen, setCreateWhiteBoardModalOpen] =
    useState(false);

  const breadcrumbItems = useMemo(() => {
    return [
      {
        title: "首页",
        onClick: () => {
          navigate("/");
        },
      },
      {
        title: "白板列表",
        onClick: () => {
          navigate("/white-board/list");
        },
      },
    ];
  }, [navigate]);

  const onClick = useMemoizedFn((whiteBoardId: number) => {
    navigate(`/white-board/detail/${whiteBoardId}`);
  });

  const handleCreateWhiteBoard = async (title: string, description: string) => {
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
      snapshot: "",
    };

    const whiteBoard = await createWhiteBoard(createWhiteBoardData);
    setCreateWhiteBoardModalOpen(false);
    navigate(`/white-board/detail/${whiteBoard.id}`);
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
      <Titlebar className={styles.titlebar}>
        <Breadcrumb
          className={styles.breadcrumb}
          items={breadcrumbItems.map((item) => ({
            title: (
              <span className={styles.breadcrumbItem} onClick={item.onClick}>
                {item.title}
              </span>
            ),
          }))}
        />
      </Titlebar>
      <div className={classnames(styles.viewContainer)}>
        <div
          className={styles.gridContainer}
          ref={gridContainerRef}
          style={{ gap }}
        >
          <For
            data={whiteBoards}
            renderItem={(whiteBoard) => (
              <WhiteBoardCard
                key={whiteBoard.id}
                whiteBoard={whiteBoard}
                style={{
                  width: itemWidth,
                }}
                onClick={onClick.bind(null, whiteBoard.id)}
              />
            )}
          />
        </div>
        <FloatButton
          icon={<PlusOutlined />}
          tooltip={"新建白板"}
          onClick={() => {
            setCreateWhiteBoardModalOpen(true);
          }}
        />
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
