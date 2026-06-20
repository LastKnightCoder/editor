import { useState } from "react";
import { Tooltip } from "antd";
import { useMemoizedFn } from "ahooks";
import SVG from "react-inlinesvg";

import webviewIcon from "@/assets/white-board/webview.svg";
import { useBoard } from "../../../hooks";
import WebviewSelectorModal from "../../WebviewSelectorModal";

interface WebviewProps {
  className?: string;
  style?: React.CSSProperties;
}

const Webview = (props: WebviewProps) => {
  const { className, style } = props;
  const board = useBoard();

  const [selectorModalOpen, setSelectorModalOpen] = useState(false);

  const handleOpen = useMemoizedFn(() => {
    setSelectorModalOpen(true);
  });

  const handleClose = useMemoizedFn(() => {
    setSelectorModalOpen(false);
  });

  return (
    <>
      <Tooltip title="网页视图">
        <div className={className} style={style} onClick={handleOpen}>
          <SVG src={webviewIcon} />
        </div>
      </Tooltip>

      <div onClick={(e) => e.stopPropagation()}>
        <WebviewSelectorModal
          open={selectorModalOpen}
          onClose={handleClose}
          board={board}
        />
      </div>
    </>
  );
};

export default Webview;
