import { memo, useState, useEffect, useRef } from "react";
import { Input, Empty, Spin, Tag, Modal, Button, message } from "antd";
import {
  SearchOutlined,
  FileImageOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  FileOutlined,
  ReloadOutlined,
  FileTextOutlined,
  AppstoreOutlined,
  CustomerServiceOutlined,
} from "@ant-design/icons";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  getAllResources,
  searchResources,
  getResourcesByType,
  scanAndUpdateResources,
} from "@/commands";
import { IResource, ResourceType } from "@/types";
import LocalImage from "@/components/LocalImage";
import LocalVideo from "@/components/LocalVideo";
import LocalAudio from "@/components/LocalAudio";

type SourceType = "content" | "whiteboard" | "podcast" | "all";

const ResourceManagement = memo(() => {
  const [resources, setResources] = useState<IResource[]>([]);
  const [allResources, setAllResources] = useState<IResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeType, setActiveType] = useState<ResourceType | "all">("all");
  const [activeSource, setActiveSource] = useState<SourceType>("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedResource, setSelectedResource] = useState<IResource | null>(
    null,
  );
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [columnsPerRow, setColumnsPerRow] = useState(4);

  // 加载资源
  const loadResources = async () => {
    setLoading(true);
    try {
      if (searchKeyword) {
        const results = await searchResources(searchKeyword);
        setAllResources(results);
      } else if (activeType === "all") {
        const results = await getAllResources();
        setAllResources(results);
      } else {
        const results = await getResourcesByType(activeType);
        setAllResources(results);
      }
    } catch (error) {
      console.error("加载资源失败:", error);
    } finally {
      setLoading(false);
    }
  };

  // 根据来源筛选资源
  useEffect(() => {
    if (activeSource === "all") {
      setResources(allResources);
    } else {
      const filtered = allResources.filter((resource) =>
        resource.sources.some((source) => source.type === activeSource),
      );
      setResources(filtered);
    }
  }, [allResources, activeSource]);

  useEffect(() => {
    void loadResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType]);

  // 响应式计算列数
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateColumns = () => {
      const width = container.clientWidth;
      // 每列最小 240px (15em)
      const cols = Math.floor(width / 240);
      setColumnsPerRow(Math.max(1, Math.min(cols, 6)));
    };

    updateColumns();

    const resizeObserver = new ResizeObserver(() => {
      updateColumns();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // 将资源分组为行
  const rows: IResource[][] = [];
  for (let i = 0; i < resources.length; i += columnsPerRow) {
    rows.push(resources.slice(i, i + columnsPerRow));
  }

  // 虚拟滚动
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 280, // 预估行高（卡片高度 + 间距）
    overscan: 2,
  });

  // 处理搜索
  const handleSearch = (value: string) => {
    setSearchKeyword(value);
    if (value) {
      searchResources(value).then(setResources);
    } else {
      loadResources();
    }
  };

  // 手动扫描资源
  const handleScanResources = async () => {
    const hide = message.loading("正在扫描资源，请稍候...", 0);
    try {
      await scanAndUpdateResources();
      message.success("资源扫描完成");
      await loadResources();
    } catch (error) {
      console.error("扫描资源失败:", error);
      message.error("扫描资源失败");
    } finally {
      hide();
    }
  };

  // 类型标签配置
  const typeConfigs = [
    {
      type: "all",
      label: "全部",
      icon: <FileOutlined />,
      color: "default",
    },
    {
      type: "image",
      label: "图片",
      icon: <FileImageOutlined />,
      color: "blue",
    },
    {
      type: "video",
      label: "视频",
      icon: <VideoCameraOutlined />,
      color: "green",
    },
    {
      type: "audio",
      label: "音频",
      icon: <AudioOutlined />,
      color: "orange",
    },
    {
      type: "attachment",
      label: "附件",
      icon: <FileOutlined />,
      color: "purple",
    },
  ];

  // 来源标签配置
  const sourceConfigs = [
    {
      type: "all",
      label: "全部来源",
      icon: <AppstoreOutlined />,
      color: "default",
    },
    {
      type: "content",
      label: "文档",
      icon: <FileTextOutlined />,
      color: "cyan",
    },
    {
      type: "whiteboard",
      label: "白板",
      icon: <AppstoreOutlined />,
      color: "purple",
    },
    {
      type: "podcast",
      label: "播客",
      icon: <CustomerServiceOutlined />,
      color: "magenta",
    },
  ];

  // 来源类型映射
  const sourceTypeMap = {
    content: "文档",
    whiteboard: "白板",
    podcast: "播客",
  };

  // 渲染资源卡片
  const renderResourceCard = (resource: IResource) => {
    const isImage = resource.type === "image";
    const isVideo = resource.type === "video";
    const isAudio = resource.type === "audio";

    return (
      <div
        key={resource.id}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer border border-gray-200 dark:border-gray-700"
        onClick={() => {
          setSelectedResource(resource);
          setDetailModalOpen(true);
        }}
      >
        {/* 预览区 */}
        <div
          className="relative bg-gray-100 dark:bg-gray-700 flex items-center justify-center"
          style={{ height: isImage ? "12.5em" : "6.25em" }}
        >
          {isImage ? (
            <LocalImage
              url={resource.path}
              alt={resource.name}
              className="w-full h-full object-cover"
            />
          ) : isVideo ? (
            <LocalVideo
              src={resource.path}
              className="w-full h-full object-cover"
            />
          ) : isAudio ? (
            <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
              <AudioOutlined style={{ fontSize: "2em" }} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
              <FileOutlined style={{ fontSize: "2em" }} />
            </div>
          )}
        </div>

        {/* 信息区 */}
        <div className="p-3">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate mb-1">
            {resource.name}
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>引用 {resource.refCount} 次</span>
            <Tag
              color={typeConfigs.find((c) => c.type === resource.type)?.color}
            >
              {typeConfigs.find((c) => c.type === resource.type)?.label}
            </Tag>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* 顶部筛选栏 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            资源管理
          </h1>
          <div className="flex items-center gap-4">
            <Button
              icon={<ReloadOutlined />}
              onClick={handleScanResources}
              type="default"
            >
              重新扫描
            </Button>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              共 {resources.length} 个资源
            </div>
          </div>
        </div>

        {/* 搜索框 */}
        <div className="mb-4">
          <Input
            placeholder="搜索资源名称或路径..."
            prefix={<SearchOutlined />}
            allowClear
            size="large"
            onChange={(e) => handleSearch(e.target.value)}
            className="max-w-md"
          />
        </div>

        {/* 类型筛选标签 */}
        <div className="mb-3">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            按类型筛选
          </div>
          <div className="flex gap-2 flex-wrap">
            {typeConfigs.map((config) => (
              <Tag.CheckableTag
                key={config.type}
                checked={activeType === config.type}
                onChange={() =>
                  setActiveType(config.type as ResourceType | "all")
                }
                className="px-4 py-1 rounded-full text-sm"
                style={{
                  backgroundColor:
                    activeType === config.type ? "#1890ff" : "#f0f0f0",
                  color: activeType === config.type ? "#fff" : "#000",
                  border: "none",
                }}
              >
                {config.icon}
                <span className="ml-1">{config.label}</span>
              </Tag.CheckableTag>
            ))}
          </div>
        </div>

        {/* 来源筛选标签 */}
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            按来源筛选
          </div>
          <div className="flex gap-2 flex-wrap">
            {sourceConfigs.map((config) => (
              <Tag.CheckableTag
                key={config.type}
                checked={activeSource === config.type}
                onChange={() => setActiveSource(config.type as SourceType)}
                className="px-4 py-1 rounded-full text-sm"
                style={{
                  backgroundColor:
                    activeSource === config.type ? "#52c41a" : "#f0f0f0",
                  color: activeSource === config.type ? "#fff" : "#000",
                  border: "none",
                }}
              >
                {config.icon}
                <span className="ml-1">{config.label}</span>
              </Tag.CheckableTag>
            ))}
          </div>
        </div>
      </div>

      {/* 内容区 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-6 py-4"
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Spin size="large" />
          </div>
        ) : resources.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Empty description="暂无资源" />
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const rowResources = rows[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div
                    className="grid gap-4"
                    style={{
                      gridTemplateColumns: `repeat(${columnsPerRow}, 1fr)`,
                    }}
                  >
                    {rowResources.map(renderResourceCard)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      <Modal
        title="资源详情"
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={null}
        width={640}
      >
        {selectedResource && (
          <div className="space-y-4">
            {/* 预览 */}
            {selectedResource.type === "image" && (
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center p-4">
                <LocalImage
                  url={selectedResource.path}
                  alt={selectedResource.name}
                  className="w-full rounded-lg"
                  style={{ maxHeight: "25em", objectFit: "contain" }}
                />
              </div>
            )}
            {selectedResource.type === "video" && (
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                <LocalVideo
                  src={selectedResource.path}
                  controls
                  className="w-full"
                  style={{ maxHeight: "25em" }}
                />
              </div>
            )}
            {selectedResource.type === "audio" && (
              <div className="w-full">
                <LocalAudio
                  src={selectedResource.path}
                  controls
                  className="w-full"
                />
              </div>
            )}

            {/* 信息 */}
            <div className="space-y-2">
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-sm">
                  资源名称：
                </span>
                <span className="text-gray-900 dark:text-gray-100">
                  {selectedResource.name}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-sm">
                  资源路径：
                </span>
                <div className="text-gray-900 dark:text-gray-100 break-all text-xs mt-1 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                  {selectedResource.path}
                </div>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-sm">
                  资源类型：
                </span>
                <Tag
                  color={
                    typeConfigs.find((c) => c.type === selectedResource.type)
                      ?.color
                  }
                  className="ml-2"
                >
                  {
                    typeConfigs.find((c) => c.type === selectedResource.type)
                      ?.label
                  }
                </Tag>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-sm">
                  引用次数：
                </span>
                <span className="text-gray-900 dark:text-gray-100 ml-2">
                  {selectedResource.refCount} 次
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-sm">
                  来源信息：
                </span>
                <div className="mt-2 space-y-1">
                  {selectedResource.sources.map((source, index) => (
                    <Tag key={index} className="mr-2">
                      {sourceTypeMap[source.type]} (ID: {source.id})
                    </Tag>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-sm">
                  创建时间：
                </span>
                <span className="text-gray-900 dark:text-gray-100 ml-2">
                  {new Date(selectedResource.createTime).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-sm">
                  更新时间：
                </span>
                <span className="text-gray-900 dark:text-gray-100 ml-2">
                  {new Date(selectedResource.updateTime).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
});

export default ResourceManagement;
