import { useState } from "react";
import { Input, Modal, Button, Tooltip } from "antd";
import { useMemoizedFn } from "ahooks";
import { v4 as getUuid } from "uuid";
import SVG from "react-inlinesvg";

import webviewIcon from "@/assets/white-board/webview.svg";
import { useBoard } from "../../../hooks";
import { GlobalOutlined } from "@ant-design/icons";

interface WebviewProps {
  className?: string;
  style?: React.CSSProperties;
}

const DEFAULT_URL = "https://www.google.com";

const Webview = (props: WebviewProps) => {
  const { className, style } = props;
  const board = useBoard();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [url, setUrl] = useState(DEFAULT_URL);

  const handleAddWebview = useMemoizedFn(() => {
    setIsModalVisible(true);
  });

  const handleModalCancel = useMemoizedFn(() => {
    setIsModalVisible(false);
  });

  const handleModalOk = useMemoizedFn(() => {
    const { minX, minY, width, height } = board.viewPort;
    const center = {
      x: minX + width / 2,
      y: minY + height / 2,
    };

    // 默认尺寸
    const webviewWidth = 600;
    const webviewHeight = 400;

    board.apply({
      type: "insert_node",
      path: [board.children.length],
      node: {
        id: getUuid(),
        type: "webview",
        url: url || DEFAULT_URL,
        x: center.x - webviewWidth / 2,
        y: center.y - webviewHeight / 2,
        width: webviewWidth,
        height: webviewHeight,
      },
    });

    setIsModalVisible(false);
  });

  const handleUrlChange = useMemoizedFn(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setUrl(e.target.value);
    },
  );

  return (
    <>
      <Tooltip title="网页视图">
        <div className={className} style={style} onClick={handleAddWebview}>
          <SVG src={webviewIcon} />
        </div>
      </Tooltip>

      <Modal
        title="添加网页视图"
        open={isModalVisible}
        onCancel={handleModalCancel}
        footer={[
          <Button key="cancel" onClick={handleModalCancel}>
            取消
          </Button>,
          <Button key="submit" type="primary" onClick={handleModalOk}>
            确定
          </Button>,
        ]}
      >
        <div className="mt-5">
          <Input
            className="h-12"
            placeholder="请输入URL (例如: https://www.google.com)"
            value={url}
            onChange={handleUrlChange}
            onPressEnter={handleModalOk}
            prefix={<GlobalOutlined />}
          />
        </div>
      </Modal>
    </>
  );
};

export default Webview;
