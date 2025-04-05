import { useState, memo, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { App, Breadcrumb, Flex, FloatButton, Input, Modal } from "antd";
import classnames from "classnames";
import useWhiteBoardStore from "@/stores/useWhiteBoardStore.ts";
import { useMemoizedFn } from "ahooks";
import For from "@/components/For";
import WhiteBoardCard from "./WhiteBoardCard";

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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const { message } = App.useApp();

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
        <Modal
          closeIcon={null}
          open={createWhiteBoardModalOpen}
          onCancel={() => setCreateWhiteBoardModalOpen(false)}
          onOk={async () => {
            if (!title) {
              message.error("请输入标题");
              return;
            }
            if (!description) {
              message.error("请输入描述");
              return;
            }
            const createWhiteBoardData = {
              title,
              description,
              tags: [],
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
              },
              snapshot: "",
              isProjectItem: false,
            };
            const whiteBoard = await createWhiteBoard(createWhiteBoardData);
            setCreateWhiteBoardModalOpen(false);
            setTitle("");
            setDescription("");
            navigate(`/white-board/detail/${whiteBoard.id}`);
          }}
        >
          <Flex gap={"middle"} vertical>
            <Flex gap={"middle"} align={"center"}>
              <p style={{ flex: "none", margin: 0 }}>标题：</p>
              <Input
                placeholder="请输入标题"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Flex>
            <Flex gap={"middle"} align={"start"}>
              <p style={{ flex: "none", margin: 0 }}>描述：</p>
              <Input.TextArea
                placeholder="请输入描述"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Flex>
          </Flex>
        </Modal>
      </div>
    </div>
  );
});

export default WhiteBoardView;
