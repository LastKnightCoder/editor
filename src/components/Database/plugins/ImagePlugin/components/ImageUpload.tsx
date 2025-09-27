import { memo, useState } from "react";
import { Button, Input, Tabs, TabsProps } from "antd";

interface ImageUploadProps {
  onUploadLocal: () => void;
  onAddLink: (link: string) => void;
}

const ImageUpload = memo((props: ImageUploadProps) => {
  const { onUploadLocal, onAddLink } = props;

  const [linkValue, setLinkValue] = useState("");

  const handleAddLink = () => {
    if (linkValue.trim()) {
      onAddLink(linkValue.trim());
      setLinkValue("");
    }
  };

  const items: TabsProps["items"] = [
    {
      key: "upload",
      label: "本地图片",
      children: (
        <div className="p-2">
          <Button onClick={onUploadLocal} className="w-full">
            选择图片
          </Button>
        </div>
      ),
    },
    {
      key: "link",
      label: "网络图片",
      children: (
        <div className="p-2 flex gap-2">
          <Input
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            placeholder="请输入图片网络地址"
            onPressEnter={handleAddLink}
            className="flex-1 min-w-0"
          />
          <Button
            onClick={handleAddLink}
            disabled={!linkValue.trim()}
            className="flex-none"
          >
            添加
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="w-80">
      <Tabs defaultActiveKey="upload" items={items} size="small" />
    </div>
  );
});

ImageUpload.displayName = "ImageUpload";

export default ImageUpload;
