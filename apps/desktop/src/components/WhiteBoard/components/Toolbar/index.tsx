import { memo } from "react";
import { Type } from "lucide-react";

import Geometry from "./Geometry";
import Arrow from "./Arrow";
import Handwrite from "./Handwrite";
import Image from "./Image";
import Video from "./Video";
import Audio from "./Audio";
import Card from "./Card";
import MindMap from "./MindMap";
import Webview from "./Webview";
import Frame from "./Frame";
import Column from "./Column";
import WhiteBoard from "./WhiteBoard";

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
      <Image />
      <Video />
      <Audio />
      <Webview />
      <ChromeGap />
      <Card />
      <WhiteBoard />
      <ChromeGap />
      <Frame />
      <Column />
    </ChromeBar>
  );
});

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
