import { useEffect, useRef, useState } from "react";
import { App, Flex, FloatButton, Input, Modal } from 'antd';
import { useMemoizedFn } from "ahooks";
import classnames from 'classnames';
import useWhiteBoardStore from "@/stores/useWhiteBoardStore.ts";

import For from "@/components/For";
import WhiteBoardCard from "./WhiteBoardCard";
import WhiteBoard from '@/layouts/components/EditWhiteBoard';

import { PlusOutlined } from '@ant-design/icons';

import styles from './index.module.less';

const MIN_WIDTH = 320;
const MAX_WIDTH = 400;
const GAP = 20;

const WhiteBoardView = () => {
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const {
    whiteBoards,
    activeWhiteBoardId,
    createWhiteBoard
  } = useWhiteBoardStore(state => ({
    whiteBoards: state.whiteBoards,
    activeWhiteBoardId: state.activeWhiteBoardId,
    createWhiteBoard: state.createWhiteBoard,
  }));

  const showEdit = !!activeWhiteBoardId;

  const [itemWidth, setItemWidth] = useState(MIN_WIDTH);
  const [createWhiteBoardModalOpen, setCreateWhiteBoardModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const { message } = App.useApp();

  const handleResize = useMemoizedFn((entries: ResizeObserverEntry[]) => {
    const { width } = entries[0].contentRect;

    const nMin = Math.ceil((width + GAP) / (MAX_WIDTH + GAP));
    const nMax = Math.floor((width + GAP) / (MIN_WIDTH + GAP));

    const n = Math.min(nMin, nMax);

    const itemWidth = (width + GAP) / n - GAP;

    setItemWidth(itemWidth);
  });

  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(handleResize);

    observer.observe(container);

    return () => {
      observer.disconnect();
    }
  }, [handleResize]);

  return (
    <div className={classnames(styles.viewContainer, { [styles.showEdit]: showEdit })}>
      <div className={styles.gridContainer} ref={gridContainerRef} style={{ gap: GAP }}>
        <For
          data={whiteBoards}
          renderItem={whiteBoard => (
            <WhiteBoardCard
              key={whiteBoard.id}
              whiteBoard={whiteBoard}
              style={{
                width: itemWidth,
              }}
            />
          )}
        />
      </div>
      <div className={styles.edit}>
        <WhiteBoard />
      </div>
      {
        !activeWhiteBoardId && (
          <FloatButton
            icon={<PlusOutlined />}
            tooltip={'新建白板'}
            onClick={() => {
              setCreateWhiteBoardModalOpen(true);
            }}
          />
        )
      }
      <Modal
        closeIcon={null}
        open={createWhiteBoardModalOpen}
        onCancel={() => setCreateWhiteBoardModalOpen(false)}
        onOk={async () => {
          if (!title) {
            message.error('请输入标题');
            return;
          }
          if (!description) {
            message.error('请输入描述');
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
                height: 0
              },
              selection: {
                selectArea: null,
                selectedElements: [],
              },
            },
            snapshot: '',
            isProjectItem: false
          }
          const whiteBoard = await createWhiteBoard(createWhiteBoardData);
          setCreateWhiteBoardModalOpen(false);
          setTitle('');
          setDescription('');
          useWhiteBoardStore.setState({
            activeWhiteBoardId: whiteBoard.id,
          });
        }}
      >
        <Flex gap={"middle"} vertical>
          <Flex gap={"middle"} align={"center"}>
            <p style={{ flex: 'none', margin: 0 }}>标题：</p>
            <Input placeholder="请输入标题" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Flex>
          <Flex gap={"middle"} align={"start"}>
            <p style={{ flex: 'none', margin: 0 }}>描述：</p>
            <Input.TextArea placeholder="请输入描述" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Flex>
        </Flex>
      </Modal>
    </div>
  )
}

export default WhiteBoardView;
