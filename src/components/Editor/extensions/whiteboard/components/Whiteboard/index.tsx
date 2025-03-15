import React, { useState } from "react";
import { useReadOnly } from "slate-react";
import { MdFullscreen, MdFullscreenExit } from "react-icons/md";
import { createPortal } from "react-dom";
import { ReactEditor, useSlate } from "slate-react";
import { Transforms } from "slate";

import { WhiteboardElement } from "@/components/Editor/types/element/whiteboard.ts";
import { IExtensionBaseProps } from "@/components/Editor/extensions/types";
import WhiteBoard from "@/components/WhiteBoard";
import If from "@/components/If";
import {
  BoardElement,
  ViewPort,
  Selection,
} from "@/components/WhiteBoard/types";

import styles from "./index.module.less";

type IWhiteboardProps = IExtensionBaseProps<WhiteboardElement>;

interface WhiteboardData {
  children: BoardElement[];
  viewPort: ViewPort;
  selection: Selection;
}

const Whiteboard: React.FC<React.PropsWithChildren<IWhiteboardProps>> = (
  props,
) => {
  const { attributes, children, element } = props;
  const editorReadOnly = useReadOnly();
  const editor = useSlate();

  const [isFullscreen, setIsFullscreen] = useState(false);

  const { data, height } = element;

  // 切换全屏状态
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // 更新白板数据
  const updateWhiteboardData = (data: WhiteboardData) => {
    if (editorReadOnly) return;

    try {
      // @ts-ignore
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(editor, { data } as any, { at: path });
    } catch (error) {
      console.error("更新白板数据失败:", error);
    }
  };

  return (
    <div {...attributes} contentEditable={false}>
      <div className={styles.whiteboardContainer}>
        <If condition={!isFullscreen}>
          <WhiteBoard
            initData={data.children}
            initViewPort={data.viewPort}
            initSelection={data.selection}
            style={{ width: "100%", height: height }}
            readonly={editorReadOnly}
            onChange={(data) => {
              if (editorReadOnly) return;
              updateWhiteboardData(data);
            }}
          />
          <div className={styles.fullscreenButton} onClick={toggleFullscreen}>
            <MdFullscreen size={20} />
          </div>
        </If>
      </div>
      {children}
      {isFullscreen &&
        createPortal(
          <div
            className={styles.fullscreenOverlay}
            onClick={() => setIsFullscreen(false)}
          >
            <div
              className={styles.fullscreenContent}
              onClick={(e) => e.stopPropagation()}
            >
              <WhiteBoard
                initData={data.children}
                initViewPort={data.viewPort}
                initSelection={data.selection}
                style={{ width: "100%", height: "100%" }}
                readonly={editorReadOnly}
                onChange={(data) => {
                  if (editorReadOnly) return;
                  updateWhiteboardData(data);
                }}
              />
              <div
                className={styles.closeButton}
                onClick={() => setIsFullscreen(false)}
              >
                <MdFullscreenExit size={20} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default Whiteboard;
