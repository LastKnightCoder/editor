import { memo, useRef, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { App, Dropdown, Input, Modal } from "antd";
import type { MenuProps } from "antd";
import {
  SearchOutlined,
  FileImageOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  FilePdfOutlined,
  BookOutlined,
  FileOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  MoreOutlined,
  ReloadOutlined,
  PlusOutlined,
  FileTextOutlined,
  AppstoreOutlined,
  CustomerServiceOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import { useVirtualizer } from "@tanstack/react-virtual";
import classnames from "classnames";
import useResourceStore from "@/stores/useResourceStore";
import type { IResource, ResourceGroup, ResourceType } from "@/types";
import { scanAndUpdateResources } from "@/commands";
import SVG from "react-inlinesvg";
import leftSidebarIcon from "@/assets/icons/sidebar-left.svg";
import { useResourceGroupDialog } from "./useResourceGroupDialog";
import { useResourceUploadDialog } from "./useResourceUploadDialog";
import { useResourceDragAndDrop } from "./useResourceDragAndDrop";

interface ResourceManagementSidebarProps {
  onFoldSidebar?: () => void;
}

type MenuClickInfo = Parameters<NonNullable<MenuProps["onClick"]>>[0];

// 虚拟列表项类型
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

// 类型配置（移到组件外部）
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
    icon: <FilePdfOutlined />,
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

// 来源配置（移到组件外部）
const sourceConfigs = [
  {
    type: "content" as const,
    label: "文档",
    icon: <FileTextOutlined />,
  },
  {
    type: "whiteboard" as const,
    label: "白板",
    icon: <AppstoreOutlined />,
  },
  {
    type: "podcast" as const,
    label: "播客",
    icon: <CustomerServiceOutlined />,
  },
  {
    type: "chat" as const,
    label: "聊天",
    icon: <MessageOutlined />,
  },
  {
    type: "ebook" as const,
    label: "电子书",
    icon: <BookOutlined />,
  },
];

const ResourceManagementSidebar = memo(
  ({ onFoldSidebar }: ResourceManagementSidebarProps) => {
    const app = App.useApp();
    const { message: messageApi } = app;

    const {
      resources,
      groups,
      selectedResourceId,
      selectedGroupId,
      selectedSystemFilter,
      searchKeyword,
      expandedSystemGroups,
      expandedUserGroups,
      expandedUngrouped,
      setSelectedResource,
      setSelectedGroup,
      setSelectedSystemFilter,
      setSearchKeyword,
      createResourceGroup,
      updateResourceGroup,
      deleteResourceGroup,
      moveResourceToGroup,
      refreshResources,
      toggleSystemGroup,
      toggleUserGroup,
      setExpandedUngrouped,
    } = useResourceStore(
      useShallow((state) => ({
        resources: state.resources,
        groups: state.groups,
        selectedResourceId: state.selectedResourceId,
        selectedGroupId: state.selectedGroupId,
        selectedSystemFilter: state.selectedSystemFilter,
        searchKeyword: state.searchKeyword,
        expandedSystemGroups: state.expandedSystemGroups,
        expandedUserGroups: state.expandedUserGroups,
        expandedUngrouped: state.expandedUngrouped,
        setSelectedResource: state.setSelectedResource,
        setSelectedGroup: state.setSelectedGroup,
        setSelectedSystemFilter: state.setSelectedSystemFilter,
        setSearchKeyword: state.setSearchKeyword,
        createResourceGroup: state.createResourceGroup,
        updateResourceGroup: state.updateResourceGroup,
        deleteResourceGroup: state.deleteResourceGroup,
        moveResourceToGroup: state.moveResourceToGroup,
        refreshResources: state.refreshResources,
        toggleSystemGroup: state.toggleSystemGroup,
        toggleUserGroup: state.toggleUserGroup,
        setExpandedUngrouped: state.setExpandedUngrouped,
      })),
    );

    const {
      groupDialogVisible,
      groupDialogMode,
      groupName,
      setGroupName,
      handleCreateGroup,
      handleEditGroup,
      handleDeleteGroup,
      handleGroupDialogOk,
      closeGroupDialog,
    } = useResourceGroupDialog({
      groups,
      createResourceGroup,
      updateResourceGroup,
      deleteResourceGroup,
      app,
    });

    const {
      uploadDialogVisible,
      uploadResourceName,
      uploadingResource,
      setUploadResourceName,
      handleOpenUploadResource,
      handleUploadFileChange,
      handleUploadDialogOk,
      closeUploadDialog,
    } = useResourceUploadDialog({
      moveResourceToGroup,
      refreshResources,
      app,
    });

    const {
      draggedResourceId,
      dragOverTarget,
      handleDragStart,
      handleDragEnd,
      handleDragOver,
      handleDragLeave,
      handleDrop,
    } = useResourceDragAndDrop({
      resources,
      moveResourceToGroup,
    });

    const handleResourceSelect = useMemoizedFn((resourceId: number) => {
      setSelectedResource(resourceId);
    });

    const handleGroupSelect = useMemoizedFn((groupId: number | null) => {
      if (groupId === null) {
        // 选中未分组
        setSelectedGroup(null);
        setSelectedSystemFilter(null);
      } else {
        setSelectedGroup(groupId);
      }
    });

    const handleSystemFilterSelect = useMemoizedFn(
      (
        type: "all" | "type" | "type-source",
        resourceType?: ResourceType,
        sourceType?: "content" | "whiteboard" | "podcast" | "chat" | "pdf",
      ) => {
        if (type === "all") {
          setSelectedSystemFilter({ type: "all" });
        } else if (type === "type" && resourceType) {
          setSelectedSystemFilter({ type: "type", resourceType });
        } else if (type === "type-source" && resourceType && sourceType) {
          setSelectedSystemFilter({
            type: "type-source",
            resourceType,
            sourceType,
          });
        }
      },
    );

    const handleScanResources = useMemoizedFn(async () => {
      const hide = messageApi.loading("正在扫描资源，请稍候...", 0);
      try {
        await scanAndUpdateResources();
        messageApi.success("资源扫描完成");
        await refreshResources();
      } catch (error) {
        console.error("扫描资源失败:", error);
        messageApi.error("扫描资源失败");
      } finally {
        hide();
      }
    });

    const handleSearch = useMemoizedFn((value: string) => {
      setSearchKeyword(value);
    });

    // 渲染分组的右键菜单
    const getGroupContextMenu = (groupId: number) => {
      return [
        {
          key: "add-subgroup",
          label: "添加子分组",
          onClick: (e: MenuClickInfo) => {
            e.domEvent.stopPropagation();
            handleCreateGroup(groupId);
          },
        },
        {
          key: "add-resource",
          label: "添加资源",
          onClick: (e: MenuClickInfo) => {
            e.domEvent.stopPropagation();
            handleOpenUploadResource(groupId);
          },
        },
        {
          key: "edit",
          label: "重命名",
          onClick: (e: MenuClickInfo) => {
            e.domEvent.stopPropagation();
            handleEditGroup(groupId);
          },
        },
        {
          key: "delete",
          label: "删除分组",
          danger: true,
          onClick: (e: MenuClickInfo) => {
            e.domEvent.stopPropagation();
            handleDeleteGroup(groupId);
          },
        },
      ];
    };

    const getUngroupedContextMenu = () => {
      return [
        {
          key: "add-resource",
          label: "添加资源",
          onClick: (e: MenuClickInfo) => {
            e.domEvent.stopPropagation();
            handleOpenUploadResource(null);
          },
        },
      ];
    };

    // 渲染资源项
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // 递归构建用户分组的扁平列表
    const buildUserGroupItems = useMemoizedFn(
      (
        parentId: number | null,
        level: number,
        items: VirtualListItem[],
        filteredResources: IResource[],
      ) => {
        const childGroups = groups.filter((g) => g.parentId === parentId);

        childGroups.forEach((group) => {
          // 检查该分组及其所有子分组是否包含筛选后的资源
          const hasResources = filteredResources.some((r) => {
            // 检查是否在当前分组
            if (r.groupId === group.id) return true;

            // 检查是否在子分组（递归）
            const isInChildGroup = (gId: number): boolean => {
              const children = groups.filter((g) => g.parentId === gId);
              return children.some(
                (child) =>
                  filteredResources.some((r) => r.groupId === child.id) ||
                  isInChildGroup(child.id),
              );
            };

            return isInChildGroup(group.id);
          });

          // 只有当分组包含资源时才显示
          if (hasResources) {
            // 添加分组项
            items.push({
              type: "user-group",
              group,
              key: `user-group-${group.id}`,
              level,
            });

            // 如果分组展开，添加子项
            if (expandedUserGroups.includes(group.id)) {
              // 递归添加子分组
              buildUserGroupItems(
                group.id,
                level + 1,
                items,
                filteredResources,
              );

              // 添加该分组下的资源
              const groupResources = filteredResources.filter(
                (r) => r.groupId === group.id,
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
      },
    );

    // 构建扁平化的虚拟列表项
    const virtualListItems = useMemo(() => {
      const items: VirtualListItem[] = [];

      // 根据搜索关键词筛选资源
      const filteredResources = searchKeyword
        ? resources.filter(
            (r) =>
              r.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
              r.path.toLowerCase().includes(searchKeyword.toLowerCase()),
          )
        : resources;

      // 系统分类
      items.push({
        type: "section-title",
        title: "系统分类",
        key: "section-system",
      });

      typeConfigs.forEach((typeConfig) => {
        const typeKey = `type-${typeConfig.type}`;
        const typeResources = filteredResources.filter(
          (r) => r.type === typeConfig.type,
        );

        // 只有当有资源时才添加类型分组
        if (typeResources.length > 0) {
          items.push({
            type: "type-group",
            config: typeConfig,
            key: typeKey,
          });

          // 如果展开，添加来源分组
          if (expandedSystemGroups.includes(typeKey)) {
            sourceConfigs.forEach((sourceConfig) => {
              const sourceResources = typeResources.filter((r) =>
                r.sources.some((s) => s.type === sourceConfig.type),
              );

              if (sourceResources.length === 0) return;

              const sourceKey = `${typeKey}-${sourceConfig.type}`;

              // 添加来源分组
              items.push({
                type: "source-group",
                config: sourceConfig,
                typeConfig,
                key: sourceKey,
                level: 1,
              });

              // 如果展开，添加资源
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
        }
      });

      // 我的分组 - 只显示包含筛选后资源的分组
      const rootUserGroups = groups.filter((g) => g.parentId === null);
      const hasUserGroupResources = filteredResources.some(
        (r) => r.groupId !== null,
      );

      if (rootUserGroups.length > 0 && hasUserGroupResources) {
        items.push({
          type: "section-title",
          title: "我的分组",
          key: "section-user",
        });

        buildUserGroupItems(null, 0, items, filteredResources);
      }

      // 未分组
      const ungroupedResources = filteredResources.filter((r) => !r.groupId);
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
      resources,
      groups,
      expandedSystemGroups,
      expandedUngrouped,
      searchKeyword,
      buildUserGroupItems,
    ]);

    // 虚拟滚动 - 根据项类型计算高度
    const virtualizer = useVirtualizer({
      count: virtualListItems.length,
      getScrollElement: () => scrollContainerRef.current,
      estimateSize: (index) => {
        const item = virtualListItems[index];
        if (item.type === "section-title") {
          // section-title: 上边距 16px + 内容 32px = 48px
          return 48;
        }
        // 其他项: 40px
        return 40;
      },
      overscan: 5,
    });

    // 渲染虚拟列表项
    const renderVirtualItem = (item: VirtualListItem) => {
      // 首先计算筛选后的资源（与 virtualListItems 中的逻辑一致）
      const filteredResources = searchKeyword
        ? resources.filter(
            (r) =>
              r.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
              r.path.toLowerCase().includes(searchKeyword.toLowerCase()),
          )
        : resources;

      switch (item.type) {
        case "section-title":
          return (
            <div className="px-3 py-2 pt-4 text-xs font-semibold text-text-secondary">
              {item.title}
            </div>
          );

        case "type-group": {
          const typeKey = `type-${item.config.type}`;
          const isExpanded = expandedSystemGroups.includes(typeKey);
          const typeResources = filteredResources.filter(
            (r) => r.type === item.config.type,
          );
          const isTypeSelected =
            selectedSystemFilter?.type === "type" &&
            selectedSystemFilter.resourceType === item.config.type;

          return (
            <div
              className={classnames(
                "flex items-center px-3 py-2 mx-2 my-0.5 rounded-md cursor-pointer transition-colors duration-200",
                {
                  "bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-200":
                    isTypeSelected,
                  "hover:bg-hover": !isTypeSelected,
                },
              )}
              onClick={() => {
                handleSystemFilterSelect("type", item.config.type);
              }}
            >
              <div
                className="shrink-0 mr-2"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSystemGroup(typeKey);
                }}
              >
                {isExpanded ? (
                  <FolderOpenOutlined className="text-base text-text-secondary" />
                ) : (
                  <FolderOutlined className="text-base text-text-secondary" />
                )}
              </div>
              <div className="flex-1 flex justify-between items-center min-w-0">
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                  {item.config.label}
                </span>
                <span className="text-xs text-text-secondary ml-2">
                  ({typeResources.length})
                </span>
              </div>
            </div>
          );
        }

        case "source-group": {
          const sourceKey = `type-${item.typeConfig.type}-${item.config.type}`;
          const isExpanded = expandedSystemGroups.includes(sourceKey);
          const isSourceSelected =
            selectedSystemFilter?.type === "type-source" &&
            selectedSystemFilter.resourceType === item.typeConfig.type &&
            selectedSystemFilter.sourceType === item.config.type;

          const typeResources = filteredResources.filter(
            (r) => r.type === item.typeConfig.type,
          );
          const sourceResources = typeResources.filter((r) =>
            r.sources.some((s) => s.type === item.config.type),
          );

          return (
            <div
              className={classnames(
                "flex items-center px-3 py-2 mx-2 my-0.5 rounded-md cursor-pointer transition-colors duration-200",
                {
                  "bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-200":
                    isSourceSelected,
                  "hover:bg-hover": !isSourceSelected,
                },
              )}
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
                className="shrink-0 mr-2"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSystemGroup(sourceKey);
                }}
              >
                {isExpanded ? (
                  <FolderOpenOutlined className="text-base text-text-secondary" />
                ) : (
                  <FolderOutlined className="text-base text-text-secondary" />
                )}
              </div>
              <div className="flex-1 flex justify-between items-center min-w-0">
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                  {item.config.label}
                </span>
                <span className="text-xs text-text-secondary ml-2">
                  ({sourceResources.length})
                </span>
              </div>
            </div>
          );
        }

        case "system-resource": {
          const resource = item.resource;
          const isSelected = selectedResourceId === resource.id;
          const isDragging = draggedResourceId === resource.id;

          const getTypeIcon = (type: ResourceType) => {
            switch (type) {
              case "image":
                return (
                  <FileImageOutlined className="text-base text-text-secondary shrink-0" />
                );
              case "video":
                return (
                  <VideoCameraOutlined className="text-base text-text-secondary shrink-0" />
                );
              case "audio":
                return (
                  <AudioOutlined className="text-base text-text-secondary shrink-0" />
                );
              case "pdf":
                return (
                  <FilePdfOutlined className="text-base text-text-secondary shrink-0" />
                );
              case "epub":
                return (
                  <BookOutlined className="text-base text-text-secondary shrink-0" />
                );
              case "attachment":
                return (
                  <FileOutlined className="text-base text-text-secondary shrink-0" />
                );
              default:
                return (
                  <FileOutlined className="text-base text-text-secondary shrink-0" />
                );
            }
          };

          return (
            <div
              className={classnames(
                "flex items-center px-3 py-2 mx-2 my-0.5 rounded-md cursor-pointer transition-colors duration-200",
                {
                  "bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-200":
                    isSelected,
                  "hover:bg-blue-50 dark:hover:bg-blue-900/20": !isSelected,
                  "opacity-50 cursor-grabbing": isDragging,
                },
              )}
              style={{ paddingLeft: `${item.level * 16 + 12}px` }}
              onClick={() => handleResourceSelect(resource.id)}
              draggable
              onDragStart={(e) => handleDragStart(e, resource.id)}
              onDragEnd={handleDragEnd}
            >
              {getTypeIcon(resource.type)}
              <span className="ml-2 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                {resource.name}
              </span>
            </div>
          );
        }

        case "user-group": {
          const group = item.group;
          const isExpanded = expandedUserGroups.includes(group.id);
          const groupResources = filteredResources.filter(
            (r) => r.groupId === group.id,
          );
          const childGroups = groups.filter((g) => g.parentId === group.id);

          // 计算包含筛选后资源的子分组数量
          const childGroupsWithResources = childGroups.filter((childGroup) => {
            const hasChildResources = filteredResources.some((r) => {
              if (r.groupId === childGroup.id) return true;

              const isInDescendantGroup = (gId: number): boolean => {
                const descendants = groups.filter((g) => g.parentId === gId);
                return descendants.some(
                  (desc) =>
                    filteredResources.some((r) => r.groupId === desc.id) ||
                    isInDescendantGroup(desc.id),
                );
              };

              return isInDescendantGroup(childGroup.id);
            });
            return hasChildResources;
          });

          const isDragOver = dragOverTarget === group.id;
          const isSelected = selectedGroupId === group.id;

          return (
            <Dropdown
              menu={{ items: getGroupContextMenu(group.id) }}
              trigger={["contextMenu"]}
            >
              <div
                className={classnames(
                  "flex items-center px-3 py-2 mx-2 my-0.5 rounded-md cursor-pointer transition-colors duration-200",
                  {
                    "bg-blue-500/10": isDragOver,
                    "bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-200":
                      isSelected,
                    "hover:bg-hover": !isDragOver && !isSelected,
                  },
                )}
                style={{ paddingLeft: `${item.level * 16 + 12}px` }}
                onClick={() => {
                  handleGroupSelect(group.id);
                }}
                onDragOver={(e) => handleDragOver(e, group.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, group.id)}
              >
                <div
                  className="shrink-0 mr-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleUserGroup(group.id);
                  }}
                >
                  {isExpanded ? (
                    <FolderOpenOutlined className="text-base text-text-secondary" />
                  ) : (
                    <FolderOutlined className="text-base text-text-secondary" />
                  )}
                </div>
                <div className="flex-1 flex justify-between items-center min-w-0">
                  <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                    {group.name}
                  </span>
                  <span className="text-xs text-text-secondary ml-2">
                    ({groupResources.length + childGroupsWithResources.length})
                  </span>
                </div>
              </div>
            </Dropdown>
          );
        }

        case "user-resource": {
          const resource = item.resource;
          const isSelected = selectedResourceId === resource.id;
          const isDragging = draggedResourceId === resource.id;

          const getTypeIcon = (type: ResourceType) => {
            switch (type) {
              case "image":
                return (
                  <FileImageOutlined className="text-base text-text-secondary shrink-0" />
                );
              case "video":
                return (
                  <VideoCameraOutlined className="text-base text-text-secondary shrink-0" />
                );
              case "audio":
                return (
                  <AudioOutlined className="text-base text-text-secondary shrink-0" />
                );
              case "pdf":
                return (
                  <FilePdfOutlined className="text-base text-text-secondary shrink-0" />
                );
              case "epub":
                return (
                  <BookOutlined className="text-base text-text-secondary shrink-0" />
                );
              case "attachment":
                return (
                  <FileOutlined className="text-base text-text-secondary shrink-0" />
                );
              default:
                return (
                  <FileOutlined className="text-base text-text-secondary shrink-0" />
                );
            }
          };

          return (
            <div
              className={classnames(
                "flex items-center px-3 py-2 mx-2 my-0.5 rounded-md cursor-pointer transition-colors duration-200",
                {
                  "bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-200":
                    isSelected,
                  "hover:bg-blue-50 dark:hover:bg-blue-900/20": !isSelected,
                  "opacity-50 cursor-grabbing": isDragging,
                },
              )}
              style={{ paddingLeft: `${item.level * 16 + 12}px` }}
              onClick={() => handleResourceSelect(resource.id)}
              draggable
              onDragStart={(e) => handleDragStart(e, resource.id)}
              onDragEnd={handleDragEnd}
            >
              {getTypeIcon(resource.type)}
              <span className="ml-2 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                {resource.name}
              </span>
            </div>
          );
        }

        case "ungrouped-header": {
          const ungroupedResources = filteredResources.filter(
            (r) => !r.groupId,
          );

          return (
            <Dropdown
              menu={{ items: getUngroupedContextMenu() }}
              trigger={["contextMenu"]}
            >
              <div
                className={classnames(
                  "flex items-center px-3 py-2 mx-2 my-0.5 rounded-md cursor-pointer transition-colors duration-200",
                  {
                    "bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-200":
                      selectedGroupId === null &&
                      selectedSystemFilter === null &&
                      selectedResourceId === null,
                    "hover:bg-hover": !(
                      selectedGroupId === null &&
                      selectedSystemFilter === null &&
                      selectedResourceId === null
                    ),
                  },
                )}
                onClick={() => {
                  handleGroupSelect(null);
                }}
                onDragOver={(e) => handleDragOver(e, null)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, null)}
              >
                <div
                  className="shrink-0 mr-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedUngrouped(!expandedUngrouped);
                  }}
                >
                  {expandedUngrouped ? (
                    <FolderOpenOutlined className="text-base text-text-secondary" />
                  ) : (
                    <FolderOutlined className="text-base text-text-secondary" />
                  )}
                </div>
                <div className="flex-1 flex justify-between items-center min-w-0">
                  <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                    未分组
                  </span>
                  <span className="text-xs text-text-secondary ml-2">
                    ({ungroupedResources.length})
                  </span>
                </div>
              </div>
            </Dropdown>
          );
        }

        case "ungrouped-resource": {
          const resource = item.resource;
          const isSelected = selectedResourceId === resource.id;
          const isDragging = draggedResourceId === resource.id;

          const getTypeIcon = (type: ResourceType) => {
            switch (type) {
              case "image":
                return (
                  <FileImageOutlined className="text-base text-text-secondary shrink-0" />
                );
              case "video":
                return (
                  <VideoCameraOutlined className="text-base text-text-secondary shrink-0" />
                );
              case "audio":
                return (
                  <AudioOutlined className="text-base text-text-secondary shrink-0" />
                );
              case "pdf":
                return (
                  <FilePdfOutlined className="text-base text-text-secondary shrink-0" />
                );
              case "epub":
                return (
                  <BookOutlined className="text-base text-text-secondary shrink-0" />
                );
              case "attachment":
                return (
                  <FileOutlined className="text-base text-text-secondary shrink-0" />
                );
              default:
                return (
                  <FileOutlined className="text-base text-text-secondary shrink-0" />
                );
            }
          };

          return (
            <div
              className={classnames(
                "flex items-center px-3 py-2 mx-2 my-0.5 rounded-md cursor-pointer transition-colors duration-200",
                {
                  "bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-200":
                    isSelected,
                  "hover:bg-blue-50 dark:hover:bg-blue-900/20": !isSelected,
                  "opacity-50 cursor-grabbing": isDragging,
                },
              )}
              style={{ paddingLeft: `${item.level * 16 + 12}px` }}
              onClick={() => handleResourceSelect(resource.id)}
              draggable
              onDragStart={(e) => handleDragStart(e, resource.id)}
              onDragEnd={handleDragEnd}
            >
              {getTypeIcon(resource.type)}
              <span className="ml-2 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                {resource.name}
              </span>
            </div>
          );
        }

        default:
          return null;
      }
    };

    // More 菜单
    const moreMenuItems: MenuProps["items"] = [
      {
        key: "scan",
        label: "刷新资源",
        icon: <ReloadOutlined />,
        onClick: () => handleScanResources(),
      },
      {
        key: "add-group",
        label: "添加分组",
        icon: <PlusOutlined />,
        onClick: () => handleCreateGroup(),
      },
    ];

    // 获取显示的资源数量
    const displayedResourcesCount = resources.length;

    return (
      <div className="h-full flex flex-col border-r border-[#f0f0f0] dark:border-[#2a2a2a]">
        {/* 搜索框 */}
        <div className="px-4 py-3 border-b border-[#f0f0f0] dark:border-[#2a2a2a]">
          <Input
            placeholder="搜索资源..."
            prefix={<SearchOutlined />}
            allowClear
            className="h-10"
            value={searchKeyword}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        {/* 标题行 */}
        <div className="px-4 py-3 flex justify-between items-center border-b border-[#f0f0f0] dark:border-[#2a2a2a]">
          <div className="flex items-center gap-2">
            <h3 className="m-0 text-base font-semibold">资源管理</h3>
            <span className="text-xs text-text-secondary">
              {displayedResourcesCount}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <SVG
              className="cursor-pointer"
              src={leftSidebarIcon}
              onClick={onFoldSidebar}
            />
            <Dropdown menu={{ items: moreMenuItems }} placement="bottomRight">
              <MoreOutlined className="cursor-pointer hover:text-blue-500 transition-colors" />
            </Dropdown>
          </div>
        </div>

        {/* 内容区 - 虚拟滚动 */}
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto py-2"
        >
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
                  {renderVirtualItem(item)}
                </div>
              );
            })}
          </div>
        </div>

        <Modal
          title="上传资源"
          open={uploadDialogVisible}
          onOk={handleUploadDialogOk}
          onCancel={closeUploadDialog}
          okText="上传"
          cancelText="取消"
          confirmLoading={uploadingResource}
        >
          <div className="flex flex-col gap-3">
            <input type="file" onChange={handleUploadFileChange} />
            <Input
              className="h-10"
              placeholder="请输入资源名称（默认为文件名）"
              value={uploadResourceName}
              onChange={(e) => setUploadResourceName(e.target.value)}
            />
          </div>
        </Modal>

        {/* 分组对话框 */}
        <Modal
          title={groupDialogMode === "create" ? "新建分组" : "编辑分组"}
          open={groupDialogVisible}
          onOk={handleGroupDialogOk}
          onCancel={closeGroupDialog}
          okText="确定"
          cancelText="取消"
        >
          <Input
            placeholder="请输入分组名称"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onPressEnter={handleGroupDialogOk}
          />
        </Modal>
      </div>
    );
  },
);

export default ResourceManagementSidebar;
