import { memo } from "react";
import classnames from "classnames";
import { useMemoizedFn } from "ahooks";
import SVG from "react-inlinesvg";
import { App } from "antd";
import Geometry from "./Geometry";
import Arrow from "./Arrow";
import Image from "./Image";
import Video from "./Video";
import Card from "./Card";
import MindMap from "./MindMap";
import Webview from "./Webview";
import Frame from "./Frame";
import { Tooltip } from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";

import textIcon from "@/assets/white-board/text.svg";

import { ECreateBoardElementType } from "../../types";
import { useBoard, useCreateElementType } from "../../hooks";

import styles from "./index.module.less";
import usePresentationState from "../../hooks/usePresentationState";

const Toolbar = memo(() => {
  const board = useBoard();
  const { modal } = App.useApp();

  const createBoardElementType = useCreateElementType();

  const { isCreatingSequence, isPresentationMode } = usePresentationState();

  const onClickCreateElement = useMemoizedFn(
    (type: ECreateBoardElementType) => {
      board.currentCreateType =
        type === createBoardElementType ? ECreateBoardElementType.None : type;
    },
  );

  const onCreatePresentation = useMemoizedFn(() => {
    if (isCreatingSequence) {
      modal.confirm({
        title: "确定停止创建演示序列吗？",
        onOk: () => {
          board.presentationManager.stopCreatingSequence();
        },
        okButtonProps: {
          danger: true,
        },
      });
    } else {
      // 清空视口选择的元素
      board.apply({
        type: "set_selection",
        properties: board.selection,
        newProperties: {
          selectedElements: [],
          selectArea: null,
        },
      });
      board.presentationManager.startCreatingSequence();
    }
  });

  const stopPropagation = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
  });

  if (isPresentationMode) return null;

  return (
    <div
      className={styles.toolBar}
      onClick={stopPropagation}
      onPointerDown={stopPropagation}
      onMouseDown={stopPropagation}
      onWheel={stopPropagation}
      onDoubleClick={stopPropagation}
    >
      <Geometry
        className={classnames(styles.toolBarItem, {
          [styles.active]:
            createBoardElementType === ECreateBoardElementType.Geometry,
        })}
      />
      <Arrow
        className={classnames(styles.toolBarItem, {
          [styles.active]:
            createBoardElementType === ECreateBoardElementType.StraightArrow,
        })}
      />
      <div
        className={classnames(styles.toolBarItem, {
          [styles.active]:
            createBoardElementType === ECreateBoardElementType.Text,
        })}
        onClick={() => {
          onClickCreateElement(ECreateBoardElementType.Text);
        }}
      >
        <SVG src={textIcon} />
      </div>
      <MindMap
        className={classnames(styles.toolBarItem, {
          [styles.active]:
            createBoardElementType === ECreateBoardElementType.MindMap,
        })}
      />
      <Image className={styles.toolBarItem} />
      <Video className={styles.toolBarItem} />
      <Webview className={styles.toolBarItem} />
      <Card className={styles.toolBarItem} />
      <Frame className={styles.toolBarItem} />
      <Tooltip title="创建演示序列">
        <div
          className={classnames(styles.toolBarItem, {
            [styles.active]: isCreatingSequence,
          })}
          onClick={onCreatePresentation}
        >
          <PlayCircleOutlined />
        </div>
      </Tooltip>
    </div>
  );
});

export default Toolbar;
