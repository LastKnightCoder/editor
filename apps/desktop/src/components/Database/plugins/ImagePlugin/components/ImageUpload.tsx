import { memo, useState } from "react";
import { cn, Button, Input } from "@tau/ui";

interface ImageUploadProps {
  onUploadLocal: () => void;
  onAddLink: (link: string) => void;
}

const ImageUpload = memo((props: ImageUploadProps) => {
  const { onUploadLocal, onAddLink } = props;

  const [linkValue, setLinkValue] = useState("");
  const [activeTab, setActiveTab] = useState<"upload" | "link">("upload");

  const handleAddLink = () => {
    if (linkValue.trim()) {
      onAddLink(linkValue.trim());
      setLinkValue("");
    }
  };

  return (
    <div className="flex w-80 flex-col gap-3 p-4">
      <div className="bg-page flex w-fit rounded-[10px] p-[2.5px]">
        {(
          [
            { key: "upload", label: "本地图片" },
            { key: "link", label: "网络图片" },
          ] as const
        ).map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "text-tau-sm ease-tau-out h-6 rounded-[8px] px-3 transition-colors",
              activeTab === tab.key
                ? "bg-accent text-ink-inverse font-medium"
                : "text-ink-2 hover:text-ink-1"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "upload" ? (
        <Button variant="secondary" block onClick={onUploadLocal}>
          选择图片
        </Button>
      ) : (
        <div className="flex gap-2">
          <Input
            value={linkValue}
            onChange={e => setLinkValue(e.target.value)}
            placeholder="请输入图片网络地址"
            onKeyDown={e => {
              if (e.key === "Enter") handleAddLink();
            }}
            className="min-w-0 flex-1"
          />
          <Button
            variant="soft"
            onClick={handleAddLink}
            disabled={!linkValue.trim()}
            className="flex-none"
          >
            添加
          </Button>
        </div>
      )}
    </div>
  );
});

ImageUpload.displayName = "ImageUpload";

export default ImageUpload;
