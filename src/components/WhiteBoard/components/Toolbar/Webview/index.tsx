import { useState } from "react";
import { Input, Modal, Button, Tooltip, Tabs, App } from "antd";
import { useMemoizedFn } from "ahooks";
import { v4 as getUuid } from "uuid";
import SVG from "react-inlinesvg";

import webviewIcon from "@/assets/white-board/webview.svg";
import { useBoard } from "../../../hooks";
import { GlobalOutlined } from "@ant-design/icons";
import useUploadResource from "@/hooks/useUploadResource";
import { selectFile, readTextFile, getFileBaseName } from "@/commands";
import { normalizeWebviewUrl } from "@/utils";

interface WebviewProps {
  className?: string;
  style?: React.CSSProperties;
}

const DEFAULT_URL = "https://www.google.com";

const Webview = (props: WebviewProps) => {
  const { className, style } = props;
  const board = useBoard();
  const uploadResource = useUploadResource();
  const { message } = App.useApp();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [tab, setTab] = useState<"url" | "local">("url");
  const [url, setUrl] = useState(DEFAULT_URL);
  const [localHtmlUrl, setLocalHtmlUrl] = useState("");
  const [localFileName, setLocalFileName] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleAddWebview = useMemoizedFn(() => {
    setIsModalVisible(true);
  });

  const handleModalCancel = useMemoizedFn(() => {
    setIsModalVisible(false);
    setTab("url");
    setUrl(DEFAULT_URL);
    setLocalHtmlUrl("");
    setLocalFileName("");
    setUploading(false);
  });

  const handleModalOk = useMemoizedFn(async () => {
    if (tab === "url") {
      if (!url.trim()) {
        message.error("请输入网址");
        return;
      }
    } else if (!localHtmlUrl) {
      message.error("请先选择本地 HTML 文件");
      return;
    }

    const { minX, minY, width, height } = board.viewPort;
    const center = {
      x: minX + width / 2,
      y: minY + height / 2,
    };

    // 默认尺寸
    const webviewWidth = 600;
    const webviewHeight = 400;
    const normalizedUrl = normalizeWebviewUrl(url) || DEFAULT_URL;
    const finalUrl = tab === "url" ? normalizedUrl : localHtmlUrl;
    const sourceType = tab === "url" ? "remote" : "local";

    board.apply({
      type: "insert_node",
      path: [board.children.length],
      node: {
        id: getUuid(),
        type: "webview",
        url: finalUrl,
        sourceType,
        x: center.x - webviewWidth / 2,
        y: center.y - webviewHeight / 2,
        width: webviewWidth,
        height: webviewHeight,
      },
    });

    handleModalCancel();
  });

  const handleUrlChange = useMemoizedFn(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setUrl(e.target.value);
    },
  );

  const handleSelectLocalHtml = useMemoizedFn(async () => {
    if (!uploadResource) {
      message.error("当前环境未配置上传能力");
      return;
    }
    const filePaths = await selectFile({
      properties: ["openFile"],
      filters: [
        {
          name: "HTML",
          extensions: ["html", "htm"],
        },
      ],
    });
    if (!filePaths || filePaths.length === 0) return;

    try {
      setUploading(true);
      const filePath = filePaths[0];
      const fileName = await getFileBaseName(filePath);
      const fileContent = await readTextFile(filePath);
      const htmlFile = new File([fileContent], fileName, {
        type: "text/html",
      });
      const uploadedUrl = await uploadResource(htmlFile);
      if (!uploadedUrl) {
        message.error("上传 HTML 文件失败");
        return;
      }
      setLocalHtmlUrl(uploadedUrl);
      setLocalFileName(fileName);
      setTab("local");
      message.success("HTML 文件已添加");
    } catch (error) {
      console.error(error);
      message.error("选择本地 HTML 文件失败");
    } finally {
      setUploading(false);
    }
  });

  return (
    <>
      {/** context holder for message? App already provided */}
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
        <Tabs
          activeKey={tab}
          onChange={(key) => setTab(key as "url" | "local")}
          items={[
            {
              key: "url",
              label: "远程网址",
              children: (
                <Input
                  className="h-12"
                  placeholder="请输入URL (例如: https://www.google.com)"
                  value={url}
                  onChange={handleUrlChange}
                  onPressEnter={handleModalOk}
                  prefix={<GlobalOutlined />}
                />
              ),
            },
            {
              key: "local",
              label: "本地 HTML",
              children: (
                <div className="flex flex-col gap-3">
                  <Button
                    type="dashed"
                    onClick={handleSelectLocalHtml}
                    loading={uploading}
                  >
                    选择本地 HTML 文件
                  </Button>
                  {localFileName && (
                    <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                      当前文件：{localFileName}
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </>
  );
};

export default Webview;
