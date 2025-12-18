import { useState } from "react";
import { Input, Button, Tooltip, App, Popover } from "antd";
import { useMemoizedFn } from "ahooks";
import { v4 as getUuid } from "uuid";
import SVG from "react-inlinesvg";
import { Globe, FileCode } from "lucide-react";

import webviewIcon from "@/assets/white-board/webview.svg";
import { useBoard } from "../../../hooks";
import { GlobalOutlined } from "@ant-design/icons";
import useUploadResource from "@/hooks/useUploadResource";
import { selectFile, readTextFile, getFileBaseName } from "@/commands";
import { normalizeWebviewUrl } from "@/utils";
import CustomModal from "@/components/CustomModal";
import ToolbarMenu, { ToolbarMenuItem } from "../ToolbarMenu";

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

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [url, setUrl] = useState(DEFAULT_URL);
  const [uploading, setUploading] = useState(false);

  const insertWebview = useMemoizedFn(
    (finalUrl: string, sourceType: "remote" | "local") => {
      const { minX, minY, width, height } = board.viewPort;
      const center = {
        x: minX + width / 2,
        y: minY + height / 2,
      };

      const webviewWidth = 600;
      const webviewHeight = 400;

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
    },
  );

  const handleUrlModalOk = useMemoizedFn(async () => {
    if (!url.trim()) {
      message.error("请输入网址");
      return;
    }

    const normalizedUrl = normalizeWebviewUrl(url) || DEFAULT_URL;
    insertWebview(normalizedUrl, "remote");
    setUrlModalOpen(false);
    setUrl(DEFAULT_URL);
  });

  const handleUrlModalCancel = useMemoizedFn(() => {
    setUrlModalOpen(false);
    setUrl(DEFAULT_URL);
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

    setPopoverOpen(false);

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

      insertWebview(uploadedUrl, "local");
      message.success("HTML 文件已添加");
    } catch (error) {
      console.error(error);
      message.error("选择本地 HTML 文件失败");
    } finally {
      setUploading(false);
    }
  });

  const menuItems: ToolbarMenuItem[] = [
    {
      key: "url",
      label: "远程网址",
      icon: <Globe size={16} />,
      description: "输入 URL 地址",
      onSelect: () => {
        setPopoverOpen(false);
        setUrlModalOpen(true);
      },
    },
    {
      key: "local",
      label: "本地 HTML",
      icon: <FileCode size={16} />,
      description: "选择本地文件",
      disabled: uploading,
      onSelect: handleSelectLocalHtml,
    },
  ];

  return (
    <>
      <Tooltip title="网页视图">
        <Popover
          open={popoverOpen}
          onOpenChange={setPopoverOpen}
          trigger={"click"}
          placement="bottom"
          arrow={false}
          content={<ToolbarMenu items={menuItems} />}
          styles={{
            container: {
              background: "transparent",
              boxShadow: "none",
              padding: 0,
            },
          }}
        >
          <div className={className} style={style}>
            <SVG src={webviewIcon} />
          </div>
        </Popover>
      </Tooltip>

      <CustomModal
        title="添加网页视图"
        open={urlModalOpen}
        onCancel={handleUrlModalCancel}
        footer={[
          <Button key="cancel" onClick={handleUrlModalCancel}>
            取消
          </Button>,
          <Button key="submit" type="primary" onClick={handleUrlModalOk}>
            确定
          </Button>,
        ]}
      >
        <Input
          className="h-12"
          placeholder="请输入URL (例如: https://www.google.com)"
          value={url}
          onChange={handleUrlChange}
          onPressEnter={handleUrlModalOk}
          prefix={<GlobalOutlined />}
        />
      </CustomModal>
    </>
  );
};

export default Webview;
