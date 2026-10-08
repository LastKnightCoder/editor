import { memo } from "react";
import { Type, Image, Video, AudioLines } from "lucide-react";
import { useWhiteboardHost, type WhiteboardTool } from "../../host";

import Geometry from "./Geometry";
import Arrow from "./Arrow";
import Handwrite from "./Handwrite";

import MindMap from "./MindMap";

import Frame from "./Frame";
import Column from "./Column";

import { ChromeBar, ChromeButton, ChromeGap } from "../../chrome";
import { ECreateBoardElementType } from "../../types";
import { useBoard, useCreateElementType } from "../../hooks";
import usePresentationState from "../../hooks/usePresentationState";

/**
 * 顶部居中工具条（D-049）：绘制 / 媒体 / 引用 / 容器四组，组间留白分隔。
 * 演示序列的创建入口已并入右下状态栏「演示」。
 */
const Toolbar = memo(() => {
  const { isPresentationMode } = usePresentationState();
  if (isPresentationMode) return null;

  return (
    <ChromeBar className="left-1/2 top-3 -translate-x-1/2">
      <Geometry />
      <Arrow />
      <Handwrite />
      <TextTool />
      <MindMap />
      <ChromeGap />
      <HostTool kind="image" />
      <HostTool kind="video" />
      <HostTool kind="audio" />
      <HostTool kind="webview" />
      <ChromeGap />
      <HostTool kind="card" />
      <HostTool kind="whiteboard" />
      <ChromeGap />
      <Frame />
      <Column />
    </ChromeBar>
  );
});

function HostTool({ kind }: { kind: WhiteboardTool }) {
  const board = useBoard();
  const Tool = useWhiteboardHost().slots.tools?.[kind];
  if (Tool) return <Tool />;
  const Icon = kind === "image" ? Image : kind === "video" ? Video : AudioLines;
  if (!["image", "video", "audio"].includes(kind)) return null;
  const label = kind === "image" ? "图片" : kind === "video" ? "视频" : "音频";
  return (
    <ChromeButton
      label={label}
      onClick={() => board.emit("context-menu:open-modal", { type: kind, action: "url" })}
    >
      <Icon strokeWidth={1.75} />
    </ChromeButton>
  );
}

function TextTool() {
  const board = useBoard();
  const createType = useCreateElementType();
  const active = createType === ECreateBoardElementType.Text;
  return (
    <ChromeButton
      label="文本"
      active={active}
      onClick={() => {
        board.currentCreateType = active
          ? ECreateBoardElementType.None
          : ECreateBoardElementType.Text;
      }}
    >
      <Type strokeWidth={1.75} />
    </ChromeButton>
  );
}

export default Toolbar;
