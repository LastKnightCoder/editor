import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import type { VLResource } from "@/types/vibe-learning";
import VideoPreview from "./VideoPreview";
import AudioPreview from "./AudioPreview";
import HtmlPreview from "./HtmlPreview";

interface ResourcePreviewPanelProps {
  resource: VLResource;
  onBack: () => void;
}

const ResourcePreviewPanel: React.FC<ResourcePreviewPanelProps> = ({ resource, onBack }) => {
  const renderPreview = () => {
    switch (resource.resourceType) {
      case "video":
        return <VideoPreview resource={resource} />;
      case "audio":
        return <AudioPreview resource={resource} />;
      case "html":
        return <HtmlPreview resource={resource} />;
      default:
        return (
          <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-gray-500">
            不支持预览此类型
          </div>
        );
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 头部 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <Tooltip title="返回">
          <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={onBack} />
        </Tooltip>
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium">
          {resource.name}
        </span>
      </div>
      {/* 预览内容 */}
      <div className="flex-1 overflow-hidden">{renderPreview()}</div>
    </div>
  );
};

export default ResourcePreviewPanel;
