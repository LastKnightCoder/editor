import React, { useMemo, useState } from "react";
import { Button, Flex, Input, Tabs, message } from "antd";
import { useMemoizedFn } from "ahooks";
import { WebLinkSourceType } from "@/types";
import { normalizeWebviewUrl } from "@/utils";
import { selectFile, getFileBaseName, readTextFile } from "@/commands";
import useUploadResource from "@/components/Editor/hooks/useUploadResource";

interface InputUrlModalProps {
  onOk: (payload: { url: string; sourceType: WebLinkSourceType }) => void;
  onCancel: () => void;
  defaultValue?: string;
  defaultSourceType?: WebLinkSourceType;
}

const InputUrlModal: React.FC<InputUrlModalProps> = ({
  onOk,
  onCancel,
  defaultValue = "",
  defaultSourceType = "remote",
}) => {
  const uploadResource = useUploadResource();
  const initialTab = useMemo(
    () => (defaultSourceType === "local" ? "local" : "url"),
    [defaultSourceType],
  );

  const [activeTab, setActiveTab] = useState<"url" | "local">(initialTab);
  const [remoteUrl, setRemoteUrl] = useState(
    defaultSourceType === "remote" ? defaultValue : "",
  );
  const [localUrl, setLocalUrl] = useState(
    defaultSourceType === "local" ? defaultValue : "",
  );
  const [localFileName, setLocalFileName] = useState("");
  const [localUploading, setLocalUploading] = useState(false);

  const handleRemoteChange = useMemoizedFn(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setRemoteUrl(e.target.value);
    },
  );

  const handleSelectLocalHtml = useMemoizedFn(async () => {
    if (!uploadResource) {
      message.error("当前编辑器未配置上传能力");
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

    const filePath = filePaths[0];
    try {
      setLocalUploading(true);
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
      setLocalUrl(uploadedUrl);
      setLocalFileName(fileName);
      setActiveTab("local");
    } catch (error) {
      console.error("选择 HTML 文件失败:", error);
      message.error("选择 HTML 文件失败");
    } finally {
      setLocalUploading(false);
    }
  });

  const handleOk = useMemoizedFn(() => {
    if (activeTab === "url") {
      if (!remoteUrl.trim()) {
        message.error("请输入网页地址");
        return;
      }
      const normalized = normalizeWebviewUrl(remoteUrl);
      if (!normalized) {
        message.error("请输入网页地址");
        return;
      }
      onOk({ url: normalized, sourceType: "remote" });
    } else {
      if (!localUrl) {
        message.error("请先选择本地 HTML 文件");
        return;
      }
      onOk({ url: localUrl, sourceType: "local" });
    }
  });

  const handleKeyDown = useMemoizedFn((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && activeTab === "url") {
      handleOk();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  });

  return (
    <Flex vertical gap={16}>
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as "url" | "local")}
        items={[
          {
            key: "url",
            label: "远程网址",
            children: (
              <Input
                size="large"
                placeholder="请输入网页地址"
                value={remoteUrl}
                onChange={handleRemoteChange}
                onKeyDown={handleKeyDown}
                autoFocus={activeTab === "url"}
              />
            ),
          },
          {
            key: "local",
            label: "本地 HTML",
            children: (
              <Flex vertical gap={12}>
                <Button
                  onClick={handleSelectLocalHtml}
                  loading={localUploading}
                >
                  选择本地 HTML 文件
                </Button>
                {localFileName && (
                  <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                    当前文件：{localFileName}
                  </div>
                )}
              </Flex>
            ),
          },
        ]}
      />
      <Flex justify="flex-end" gap={8}>
        <Button onClick={onCancel}>取消</Button>
        <Button
          type="primary"
          onClick={handleOk}
          disabled={
            (activeTab === "url" && !remoteUrl.trim()) ||
            (activeTab === "local" && !localUrl)
          }
        >
          确定
        </Button>
      </Flex>
    </Flex>
  );
};

export default InputUrlModal;
