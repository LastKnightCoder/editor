import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Empty, Spin } from "antd";
import classNames from "classnames";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  FolderOutlined,
  FolderOpenOutlined,
  FileImageOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  FileOutlined,
  BookOutlined,
  SearchOutlined,
} from "@ant-design/icons";

import { getAllResourceGroups, getAllResources } from "@/commands";
import type { IResource, ResourceGroup, ResourceType } from "@/types";
import LocalImage from "@/components/LocalImage";
import LocalVideo from "@/components/LocalVideo";

import styles from "./index.module.less";
import useTheme from "@/hooks/useTheme";
import CustomModal from "@/components/CustomModal";

const MAX_MODAL_BODY_HEIGHT = "calc(100vh - 200px)";

type SystemFilter =
  | { type: "all" }
  | { type: "ungrouped" }
  | { type: "type"; resourceType: ResourceType }
  | {
      type: "type-source";
      resourceType: ResourceType;
      sourceType: "content" | "whiteboard" | "podcast";
    };

interface ResourcePickerModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (resources: IResource[]) => void | Promise<void>;
  allowedTypes: ResourceType[];
  multiple?: boolean;
  defaultSelectedIds?: number[];
  title?: string;
  okText?: string;
  emptyDescription?: string;
}

const typeConfigs = [
  {
    type: "image" as ResourceType,
    label: "图片",
    icon: <FileImageOutlined />,
  },
  {
    type: "video" as ResourceType,
    label: "视频",
    icon: <VideoCameraOutlined />,
  },
  {
    type: "audio" as ResourceType,
    label: "音频",
    icon: <AudioOutlined />,
  },
  {
    type: "pdf" as ResourceType,
    label: "PDF",
    icon: <FileOutlined />,
  },
  {
    type: "epub" as ResourceType,
    label: "EPUB",
    icon: <BookOutlined />,
  },
  {
    type: "attachment" as ResourceType,
    label: "附件",
    icon: <FileOutlined />,
  },
];

const sourceConfigs = [
  {
    type: "content" as const,
    label: "文档",
  },
  {
    type: "whiteboard" as const,
    label: "白板",
  },
  {
    type: "podcast" as const,
    label: "播客",
  },
];

type VirtualListItem =
  | { type: "section-title"; title: string; key: string }
  | { type: "type-group"; config: (typeof typeConfigs)[0]; key: string }
  | {
      type: "source-group";
      config: (typeof sourceConfigs)[0];
      typeConfig: (typeof typeConfigs)[0];
      key: string;
      level: number;
    }
  | { type: "system-resource"; resource: IResource; key: string; level: number }
  | { type: "user-group"; group: ResourceGroup; key: string; level: number }
  | { type: "user-resource"; resource: IResource; key: string; level: number }
  | { type: "ungrouped-header"; key: string }
  | {
      type: "ungrouped-resource";
      resource: IResource;
      key: string;
      level: number;
    };

const ResourcePickerModal = ({
  open,
  onCancel,
  onConfirm,
  allowedTypes,
  multiple = true,
  defaultSelectedIds,
  title = "选择资源",
  okText = "插入",
  emptyDescription = "暂无资源",
}: ResourcePickerModalProps) => {
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(false);
  const [resources, setResources] = useState<IResource[]>([]);
  const [resourceGroups, setResourceGroups] = useState<ResourceGroup[]>([]);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [systemFilter, setSystemFilter] = useState<SystemFilter>({
    type: "all",
  });
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState<number[]>([]);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [expandedSystemGroups, setExpandedSystemGroups] = useState<string[]>(
    [],
  );
  const [expandedUserGroups, setExpandedUserGroups] = useState<number[]>([]);
  const [expandedUngrouped, setExpandedUngrouped] = useState(true);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const [columnsPerRow, setColumnsPerRow] = useState(4);

  useEffect(() => {
    if (!open) {
      return;
    }
    let mounted = true;
    const fetchData = async () => {
      try {
        setLoading(true);
        const [resourceList, groups] = await Promise.all([
          getAllResources(),
          getAllResourceGroups(),
        ]);
        if (!mounted) return;
        setResources(resourceList);
        setResourceGroups(groups);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    fetchData();
    return () => {
      mounted = false;
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setSelectedResourceIds(defaultSelectedIds ?? []);
    }
  }, [open, defaultSelectedIds]);

  const searchedResources = useMemo(() => {
    let result = resources.filter((resource) =>
      allowedTypes.includes(resource.type),
    );

    if (searchKeyword.trim()) {
      const keyword = searchKeyword.trim().toLowerCase();
      result = result.filter(
        (resource) =>
          resource.name.toLowerCase().includes(keyword) ||
          resource.path.toLowerCase().includes(keyword),
      );
    }
    return result;
  }, [allowedTypes, resources, searchKeyword]);

  const filteredResources = useMemo(() => {
    let result = searchedResources;

    if (selectedGroupId !== null) {
      result = result.filter(
        (resource) => resource.groupId === selectedGroupId,
      );
    } else {
      if (systemFilter.type === "ungrouped") {
        result = result.filter((resource) => resource.groupId === null);
      } else if (systemFilter.type === "type") {
        result = result.filter(
          (resource) => resource.type === systemFilter.resourceType,
        );
      } else if (systemFilter.type === "type-source") {
        result = result.filter(
          (resource) =>
            resource.type === systemFilter.resourceType &&
            resource.sources.some((s) => s.type === systemFilter.sourceType),
        );
      }
    }
    return result;
  }, [searchedResources, selectedGroupId, systemFilter]);

  const resourceRows = useMemo(() => {
    if (columnsPerRow <= 0) return [];
    const rows: IResource[][] = [];
    for (let i = 0; i < filteredResources.length; i += columnsPerRow) {
      rows.push(filteredResources.slice(i, i + columnsPerRow));
    }
    return rows;
  }, [filteredResources, columnsPerRow]);

  useEffect(() => {
    const container = gridScrollRef.current;
    if (!container) return;

    const updateColumns = () => {
      const width = container.clientWidth || 0;
      const computed = Math.max(1, Math.min(Math.floor(width / 220), 6));
      setColumnsPerRow(computed);
    };

    updateColumns();

    const resizeObserver = new ResizeObserver(() => {
      updateColumns();
    });

    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [open]);

  const selectedResources = useMemo(() => {
    return selectedResourceIds
      .map((id) => resources.find((resource) => resource.id === id))
      .filter((resource): resource is IResource => !!resource);
  }, [selectedResourceIds, resources]);

  const handleToggleResource = (id: number) => {
    setSelectedResourceIds((prev) => {
      if (!multiple) {
        return prev[0] === id ? [] : [id];
      }
      return prev.includes(id)
        ? prev.filter((resourceId) => resourceId !== id)
        : [...prev, id];
    });
  };

  const handleConfirm = async () => {
    if (selectedResources.length === 0) {
      return;
    }
    try {
      setConfirmLoading(true);
      await onConfirm(selectedResources);
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleGroupSelect = (groupId: number | null) => {
    setSelectedGroupId(groupId);
    setSelectedResourceIds([]);
    setSystemFilter(groupId === null ? { type: "ungrouped" } : { type: "all" });
  };

  const handleSystemFilterSelect = (
    type: SystemFilter["type"],
    config?: ResourceType,
    sourceType?: "content" | "whiteboard" | "podcast",
  ) => {
    if (type === "all") {
      setSystemFilter({ type: "all" });
    } else if (type === "type" && config) {
      setSystemFilter({ type: "type", resourceType: config });
    } else if (type === "type-source" && config && sourceType) {
      setSystemFilter({
        type: "type-source",
        resourceType: config,
        sourceType,
      });
    }
    setSelectedGroupId(null);
  };

  const toggleSystemGroup = (key: string) => {
    setExpandedSystemGroups((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const toggleUserGroup = (id: number) => {
    setExpandedUserGroups((prev) =>
      prev.includes(id) ? prev.filter((gid) => gid !== id) : [...prev, id],
    );
  };

  const sidebarScrollRef = useRef<HTMLDivElement>(null);

  const buildUserGroupItems = (
    parentId: number | null,
    level: number,
    items: VirtualListItem[],
    filtered: IResource[],
  ) => {
    const childGroups = resourceGroups.filter((g) => g.parentId === parentId);

    childGroups.forEach((group) => {
      const hasResources = filtered.some((r) => {
        if (r.groupId === group.id) return true;

        const isInChildGroup = (gid: number): boolean => {
          const children = resourceGroups.filter((g) => g.parentId === gid);
          return children.some(
            (child) =>
              filtered.some((resource) => resource.groupId === child.id) ||
              isInChildGroup(child.id),
          );
        };

        return isInChildGroup(group.id);
      });

      if (hasResources) {
        items.push({
          type: "user-group",
          group,
          key: `user-group-${group.id}`,
          level,
        });

        if (expandedUserGroups.includes(group.id)) {
          buildUserGroupItems(group.id, level + 1, items, filtered);
          const groupResources = filtered.filter(
            (resource) => resource.groupId === group.id,
          );
          groupResources.forEach((resource) => {
            items.push({
              type: "user-resource",
              resource,
              key: `user-resource-${resource.id}`,
              level: level + 1,
            });
          });
        }
      }
    });
  };

  const virtualListItems = useMemo(() => {
    const items: VirtualListItem[] = [];
    const filtered = searchedResources;

    items.push({
      type: "section-title",
      title: "系统分类",
      key: "section-system",
    });

    typeConfigs
      .filter((cfg) => allowedTypes.includes(cfg.type))
      .forEach((typeConfig) => {
        const typeKey = `type-${typeConfig.type}`;
        const typeResources = filtered.filter(
          (resource) => resource.type === typeConfig.type,
        );
        if (typeResources.length === 0) return;

        items.push({
          type: "type-group",
          config: typeConfig,
          key: typeKey,
        });

        if (expandedSystemGroups.includes(typeKey)) {
          sourceConfigs.forEach((sourceConfig) => {
            const sourceResources = typeResources.filter((resource) =>
              resource.sources.some(
                (source) => source.type === sourceConfig.type,
              ),
            );
            if (sourceResources.length === 0) return;

            const sourceKey = `${typeKey}-${sourceConfig.type}`;
            items.push({
              type: "source-group",
              config: sourceConfig,
              typeConfig,
              key: sourceKey,
              level: 1,
            });

            if (expandedSystemGroups.includes(sourceKey)) {
              sourceResources.forEach((resource) => {
                items.push({
                  type: "system-resource",
                  resource,
                  key: `system-resource-${resource.id}`,
                  level: 2,
                });
              });
            }
          });
        }
      });

    const rootGroups = resourceGroups.filter(
      (group) => group.parentId === null,
    );
    const hasGroupedResources = filtered.some((resource) => resource.groupId);

    if (rootGroups.length > 0 && hasGroupedResources) {
      items.push({
        type: "section-title",
        title: "我的分组",
        key: "section-user",
      });
      buildUserGroupItems(null, 0, items, filtered);
    }

    const ungroupedResources = filtered.filter((resource) => !resource.groupId);

    if (ungroupedResources.length > 0) {
      items.push({
        type: "section-title",
        title: "未分组",
        key: "section-ungrouped",
      });
      items.push({
        type: "ungrouped-header",
        key: "ungrouped-header",
      });
      if (expandedUngrouped) {
        ungroupedResources.forEach((resource) => {
          items.push({
            type: "ungrouped-resource",
            resource,
            key: `ungrouped-resource-${resource.id}`,
            level: 1,
          });
        });
      }
    }

    return items;
  }, [
    allowedTypes,
    filteredResources,
    resourceGroups,
    expandedSystemGroups,
    expandedUserGroups,
    expandedUngrouped,
  ]);

  const virtualizer = useVirtualizer({
    count: virtualListItems.length,
    getScrollElement: () => sidebarScrollRef.current,
    estimateSize: (index) => {
      const item = virtualListItems[index];
      if (item.type === "section-title") {
        return 48;
      }
      return 40;
    },
    overscan: 5,
  });

  const gridVirtualizer = useVirtualizer({
    count: resourceRows.length,
    getScrollElement: () => gridScrollRef.current,
    estimateSize: () => 260,
    overscan: 3,
  });

  const renderSidebarItem = (item: VirtualListItem) => {
    const filtered = searchedResources;

    switch (item.type) {
      case "section-title":
        return (
          <div className={styles.sectionTitle} key={item.key}>
            {item.title}
          </div>
        );
      case "type-group": {
        const typeKey = `type-${item.config.type}`;
        const isExpanded = expandedSystemGroups.includes(typeKey);
        const isSelected =
          systemFilter.type === "type" &&
          systemFilter.resourceType === item.config.type;
        const count = filtered.filter(
          (resource) => resource.type === item.config.type,
        ).length;
        return (
          <div
            key={item.key}
            className={classNames(styles.sidebarItem, {
              [styles.active]: isSelected,
            })}
            onClick={() => {
              handleSystemFilterSelect("type", item.config.type);
            }}
          >
            <div
              className={styles.sidebarFolderIcon}
              onClick={(e) => {
                e.stopPropagation();
                toggleSystemGroup(typeKey);
              }}
            >
              {isExpanded ? <FolderOpenOutlined /> : <FolderOutlined />}
            </div>
            <div className={styles.sidebarItemContent}>
              <span>{item.config.label}</span>
              <span className={styles.count}>({count})</span>
            </div>
          </div>
        );
      }
      case "source-group": {
        const sourceKey = `type-${item.typeConfig.type}-${item.config.type}`;
        const isExpanded = expandedSystemGroups.includes(sourceKey);
        const isSelected =
          systemFilter.type === "type-source" &&
          systemFilter.resourceType === item.typeConfig.type &&
          systemFilter.sourceType === item.config.type;
        const typeResources = filtered.filter(
          (resource) => resource.type === item.typeConfig.type,
        );
        const count = typeResources.filter((resource) =>
          resource.sources.some((s) => s.type === item.config.type),
        ).length;
        return (
          <div
            key={item.key}
            className={classNames(styles.sidebarItem, {
              [styles.active]: isSelected,
            })}
            style={{ paddingLeft: `${item.level * 16 + 12}px` }}
            onClick={() => {
              handleSystemFilterSelect(
                "type-source",
                item.typeConfig.type,
                item.config.type,
              );
            }}
          >
            <div
              className={styles.sidebarFolderIcon}
              onClick={(e) => {
                e.stopPropagation();
                toggleSystemGroup(sourceKey);
              }}
            >
              {isExpanded ? <FolderOpenOutlined /> : <FolderOutlined />}
            </div>
            <div className={styles.sidebarItemContent}>
              <span>{item.config.label}</span>
              <span className={styles.count}>({count})</span>
            </div>
          </div>
        );
      }
      case "system-resource":
      case "user-resource":
      case "ungrouped-resource": {
        const resource = item.resource;
        const isSelected = selectedResourceIds.includes(resource.id);
        return (
          <div
            key={item.key}
            className={classNames(styles.sidebarLeafItem, {
              [styles.active]: isSelected,
            })}
            style={{ paddingLeft: `${(item.level ?? 0) * 16 + 36}px` }}
            onClick={() => {
              handleToggleResource(resource.id);
            }}
          >
            {getResourceTypeIcon(resource.type)}
            <span className={styles.leafLabel}>{resource.name}</span>
          </div>
        );
      }
      case "user-group": {
        const group = item.group;
        const isExpanded = expandedUserGroups.includes(group.id);
        const groupResources = filtered.filter(
          (resource) => resource.groupId === group.id,
        );
        const isSelected = selectedGroupId === group.id;
        return (
          <div
            key={item.key}
            className={classNames(styles.sidebarItem, {
              [styles.active]: isSelected,
            })}
            style={{ paddingLeft: `${item.level * 16 + 12}px` }}
            onClick={() => handleGroupSelect(group.id)}
          >
            <div
              className={styles.sidebarFolderIcon}
              onClick={(e) => {
                e.stopPropagation();
                toggleUserGroup(group.id);
              }}
            >
              {isExpanded ? <FolderOpenOutlined /> : <FolderOutlined />}
            </div>
            <div className={styles.sidebarItemContent}>
              <span>{group.name}</span>
              <span className={styles.count}>({groupResources.length})</span>
            </div>
          </div>
        );
      }
      case "ungrouped-header": {
        return (
          <div
            key={item.key}
            className={classNames(styles.sidebarItem, {
              [styles.active]: systemFilter.type === "ungrouped",
            })}
            onClick={() => handleGroupSelect(null)}
          >
            <div
              className={styles.sidebarFolderIcon}
              onClick={(e) => {
                e.stopPropagation();
                setExpandedUngrouped((prev) => !prev);
              }}
            >
              {expandedUngrouped ? <FolderOpenOutlined /> : <FolderOutlined />}
            </div>
            <div className={styles.sidebarItemContent}>
              <span>未分组</span>
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const getResourceTypeIcon = (type: ResourceType) => {
    switch (type) {
      case "image":
        return <FileImageOutlined />;
      case "video":
        return <VideoCameraOutlined />;
      case "audio":
        return <AudioOutlined />;
      case "pdf":
        return <FileOutlined />;
      case "epub":
        return <BookOutlined />;
      default:
        return <FileOutlined />;
    }
  };

  const renderSidebar = () => (
    <div className={styles.sidebarContainer}>
      <div className={styles.sidebarScroll} ref={sidebarScrollRef}>
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = virtualListItems[virtualItem.index];
            return (
              <div
                key={virtualItem.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {renderSidebarItem(item)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderResourcePreview = (resource: IResource) => {
    if (resource.type === "image") {
      return (
        <LocalImage
          url={resource.path}
          className={styles.previewMedia}
          alt={resource.name}
        />
      );
    }

    if (resource.type === "video") {
      return (
        <LocalVideo
          src={resource.path}
          className={styles.previewMedia}
          muted
          loop
          controls={false}
        />
      );
    }

    if (resource.type === "audio") {
      return (
        <div className={styles.audioPreview}>
          <AudioOutlined />
        </div>
      );
    }

    if (resource.type === "pdf") {
      return (
        <div className={styles.audioPreview}>
          <FileOutlined />
        </div>
      );
    }

    if (resource.type === "epub") {
      return (
        <div className={styles.audioPreview}>
          <BookOutlined />
        </div>
      );
    }

    return (
      <div className={styles.audioPreview}>
        <FileOutlined />
      </div>
    );
  };

  return (
    <CustomModal
      open={open}
      onCancel={onCancel}
      onOk={handleConfirm}
      confirmLoading={confirmLoading}
      okText={okText}
      cancelText="取消"
      title={title}
      width={960}
      okButtonProps={{ disabled: selectedResources.length === 0 }}
      contentClassName="p-0 flex flex-col"
      bodyClassName="flex-1 flex flex-col p-0"
      overlayClassName="items-start pt-10"
      centered={false}
    >
      <div
        className={classNames(styles.modalBody, {
          [styles.dark]: isDark,
        })}
        style={{ maxHeight: MAX_MODAL_BODY_HEIGHT }}
      >
        <div className={styles.searchRow}>
          <Input
            placeholder="搜索资源名称或路径"
            allowClear
            prefix={<SearchOutlined />}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            className="h-10"
          />
        </div>
        <div className={classNames(styles.content, { [styles.dark]: isDark })}>
          {renderSidebar()}
          <div className={styles.gridWrapper}>
            <div className={styles.gridScroll} ref={gridScrollRef}>
              {loading ? (
                <div className={styles.gridLoading}>
                  <Spin />
                </div>
              ) : filteredResources.length === 0 ? (
                <div className={styles.emptyWrapper}>
                  <Empty description={emptyDescription} />
                </div>
              ) : (
                <div
                  className={styles.virtualWrapper}
                  style={{ height: `${gridVirtualizer.getTotalSize()}px` }}
                >
                  {gridVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = resourceRows[virtualRow.index] || [];
                    return (
                      <div
                        key={virtualRow.key}
                        ref={gridVirtualizer.measureElement}
                        className={styles.virtualRow}
                        style={{
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <div
                          className={styles.gridRow}
                          style={{
                            gridTemplateColumns: `repeat(${columnsPerRow}, minmax(0, 1fr))`,
                          }}
                        >
                          {row.map((resource) => {
                            const isSelected = selectedResourceIds.includes(
                              resource.id,
                            );
                            return (
                              <div
                                key={resource.id}
                                className={classNames(styles.card, {
                                  [styles.selected]: isSelected,
                                })}
                                onClick={() =>
                                  handleToggleResource(resource.id)
                                }
                              >
                                <div className={styles.preview}>
                                  {renderResourcePreview(resource)}
                                </div>
                                <div className={styles.cardBody}>
                                  <div className={styles.cardTitle}>
                                    {resource.name}
                                  </div>
                                  <div className={styles.cardMeta}>
                                    引用 {resource.refCount} 次 ·{" "}
                                    {
                                      typeConfigs.find(
                                        (cfg) => cfg.type === resource.type,
                                      )?.label
                                    }
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </CustomModal>
  );
};

export default ResourcePickerModal;
