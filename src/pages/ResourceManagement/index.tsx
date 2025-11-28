import { memo, useState, useEffect, useRef } from "react";
import { Empty, Tag, Button, message, Dropdown, Modal, Input } from "antd";
import type { MenuProps } from "antd";
import {
  FileImageOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  FilePdfOutlined,
  BookOutlined,
  FileOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn, useLocalStorageState } from "ahooks";
import { AnimatePresence, motion } from "framer-motion";
import SVG from "react-inlinesvg";
import rightSidebarIcon from "@/assets/icons/sidebar-right.svg";
import useResourceStore from "@/stores/useResourceStore";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import { updateResourceName } from "@/commands";
import { IResource } from "@/types";
import LocalImage from "@/components/LocalImage";
import LocalVideo from "@/components/LocalVideo";
import ResourceDetailSidebar from "./components/ResourceDetailSidebar";
import ResourceManagementSidebar from "./components/ResourceManagementSidebar";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";

const ResourceManagement = memo(() => {
  const {
    resources,
    groups,
    selectedResourceId,
    selectedGroupId,
    selectedSystemFilter,
    searchKeyword,
    initResources,
    initResourceGroups,
    moveResourceToGroup,
    refreshResources,
  } = useResourceStore(
    useShallow((state) => ({
      resources: state.resources,
      groups: state.groups,
      selectedResourceId: state.selectedResourceId,
      selectedGroupId: state.selectedGroupId,
      selectedSystemFilter: state.selectedSystemFilter,
      searchKeyword: state.searchKeyword,
      initResources: state.initResources,
      initResourceGroups: state.initResourceGroups,
      moveResourceToGroup: state.moveResourceToGroup,
      refreshResources: state.refreshResources,
    })),
  );

  const [hideSidebar, setHideSidebar] = useLocalStorageState(
    "resource-management-hide-sidebar",
    {
      defaultValue: false,
    },
  );

  const [sidebarWidth, setSidebarWidth] = useLocalStorageState(
    "resource-management-sidebar-width",
    {
      defaultValue: 300,
    },
  );

  const [detailSidebarWidth, setDetailSidebarWidth] = useState(480);
  const [selectedResource, setSelectedResource] = useState<IResource | null>(
    null,
  );
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renamingResource, setRenamingResource] = useState<IResource | null>(
    null,
  );
  const [newResourceName, setNewResourceName] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [columnsPerRow, setColumnsPerRow] = useState(4);

  // 在数据库连接或切换时加载资源数据
  useDatabaseChangeEffect(() => {
    initResources();
    initResourceGroups();
  });

  // 根据选择获取要显示的资源
  const displayedResources = (() => {
    // 首先根据搜索关键词筛选资源
    const filteredResources = searchKeyword
      ? resources.filter(
          (r) =>
            r.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
            r.path.toLowerCase().includes(searchKeyword.toLowerCase()),
        )
      : resources;

    if (selectedGroupId !== null) {
      // 显示选中用户分组的资源
      return filteredResources.filter((r) => r.groupId === selectedGroupId);
    } else if (selectedSystemFilter) {
      // 显示系统筛选的资源
      if (selectedSystemFilter.type === "all") {
        return filteredResources;
      } else if (selectedSystemFilter.type === "type") {
        return filteredResources.filter(
          (r) => r.type === selectedSystemFilter.resourceType,
        );
      } else if (selectedSystemFilter.type === "type-source") {
        return filteredResources.filter(
          (r) =>
            r.type === selectedSystemFilter.resourceType &&
            r.sources.some((s) => s.type === selectedSystemFilter.sourceType),
        );
      }
    } else if (selectedGroupId === null && selectedResourceId === null) {
      // 选中了"未分组"
      return filteredResources.filter((r) => !r.groupId);
    }
    // 默认显示所有资源
    return filteredResources;
  })();

  // 当选中的资源 ID 改变时，更新 selectedResource
  useEffect(() => {
    if (selectedResourceId !== null) {
      const resource = resources.find((r) => r.id === selectedResourceId);
      setSelectedResource(resource || null);
    } else {
      setSelectedResource(null);
    }
  }, [selectedResourceId, resources]);

  // 响应式计算列数
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateColumns = () => {
      const width = container.clientWidth;
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
  for (let i = 0; i < displayedResources.length; i += columnsPerRow) {
    rows.push(displayedResources.slice(i, i + columnsPerRow));
  }

  // 虚拟滚动
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 280,
    overscan: 2,
  });

  const onFoldSidebar = useMemoizedFn(() => {
    setHideSidebar(!hideSidebar);
  });

  // 打开重命名弹窗
  const handleOpenRenameModal = (resource: IResource, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingResource(resource);
    setNewResourceName(resource.name);
    setRenameModalVisible(true);
  };

  // 确认重命名
  const handleConfirmRename = async () => {
    if (!renamingResource || !newResourceName.trim()) {
      message.error("名称不能为空");
      return;
    }

    try {
      await updateResourceName(renamingResource.id, newResourceName.trim());
      message.success("名称修改成功");
      setRenameModalVisible(false);
      setRenamingResource(null);
      setNewResourceName("");
      await refreshResources();
      if (selectedResource?.id === renamingResource.id) {
        setSelectedResource({
          ...renamingResource,
          name: newResourceName.trim(),
        });
      }
    } catch (error) {
      console.error("修改名称失败:", error);
      message.error("修改名称失败");
    }
  };

  // 取消重命名
  const handleCancelRename = () => {
    setRenameModalVisible(false);
    setRenamingResource(null);
    setNewResourceName("");
  };

  // 递归构建分组菜单
  const buildGroupMenu = (
    parentId: number | null,
    resourceId: number,
  ): Array<{
    key: string;
    label: string;
    onClick?: (e: Parameters<NonNullable<MenuProps["onClick"]>>[0]) => void;
    children?: Array<{
      key: string;
      label: string;
      onClick?: (e: Parameters<NonNullable<MenuProps["onClick"]>>[0]) => void;
      children?: unknown;
    }>;
  }> => {
    const childGroups = groups.filter((g) => g.parentId === parentId);
    const menu: Array<{
      key: string;
      label: string;
      onClick?: (e: Parameters<NonNullable<MenuProps["onClick"]>>[0]) => void;
      children?: Array<{
        key: string;
        label: string;
        onClick?: (e: Parameters<NonNullable<MenuProps["onClick"]>>[0]) => void;
        children?: unknown;
      }>;
    }> = [];

    childGroups.forEach((group) => {
      const subMenu = buildGroupMenu(group.id, resourceId);
      const item: {
        key: string;
        label: string;
        onClick?: (e: Parameters<NonNullable<MenuProps["onClick"]>>[0]) => void;
        children?: Array<{
          key: string;
          label: string;
          onClick?: (
            e: Parameters<NonNullable<MenuProps["onClick"]>>[0],
          ) => void;
          children?: unknown;
        }>;
      } = {
        key: `group-${group.id}`,
        label: group.name,
        onClick: (e) => {
          if (e.key === `group-${group.id}`) {
            e.domEvent.stopPropagation();
            handleMoveToGroup(resourceId, group.id);
          }
        },
      };

      if (subMenu.length > 0) {
        item.children = subMenu;
      }

      menu.push(item);
    });

    return menu;
  };

  // 处理移动资源到分组
  const handleMoveToGroup = useMemoizedFn(
    async (resourceId: number, targetGroupId: number | null) => {
      const resource = resources.find((r) => r.id === resourceId);
      if (!resource) {
        return;
      }

      if (resource.groupId === targetGroupId) {
        return;
      }

      try {
        await moveResourceToGroup(resourceId, targetGroupId);
        message.success(targetGroupId ? "已移动到分组" : "已移到未分组");
      } catch (error) {
        message.error("移动失败");
      }
    },
  );

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
      type: "pdf",
      label: "PDF",
      icon: <FilePdfOutlined />,
      color: "red",
    },
    {
      type: "epub",
      label: "EPUB",
      icon: <BookOutlined />,
      color: "volcano",
    },
    {
      type: "attachment",
      label: "附件",
      icon: <FileOutlined />,
      color: "purple",
    },
  ];

  // 渲染资源卡片
  const renderResourceCard = (resource: IResource) => {
    const isImage = resource.type === "image";
    const isVideo = resource.type === "video";
    const isAudio = resource.type === "audio";
    const isPdf = resource.type === "pdf";
    const isEpub = resource.type === "epub";

    // 构建移动到分组菜单
    const groupMenuItems = buildGroupMenu(null, resource.id);
    const moveToGroupMenu =
      groupMenuItems.length > 0
        ? [
            {
              key: "ungrouped",
              label: "未分组",
              onClick: (
                e: Parameters<NonNullable<MenuProps["onClick"]>>[0],
              ) => {
                e.domEvent.stopPropagation();
                handleMoveToGroup(resource.id, null);
              },
            },
            ...groupMenuItems,
          ]
        : [];

    // 更多操作菜单
    const menuItems: MenuProps["items"] = [
      {
        key: "rename",
        label: "修改名称",
        onClick: ({ domEvent }) => {
          handleOpenRenameModal(resource, domEvent as React.MouseEvent);
        },
      },
    ];

    if (moveToGroupMenu.length > 0) {
      menuItems.push({
        key: "move-to-group",
        label: "移动到分组",
        children: moveToGroupMenu,
      });
    } else {
      menuItems.push({
        key: "move-to-ungrouped",
        label: "移到未分组",
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation();
          handleMoveToGroup(resource.id, null);
        },
      });
    }

    return (
      <div
        key={resource.id}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer border border-gray-200 dark:border-gray-700 relative group"
        onClick={() => {
          setSelectedResource(resource);
        }}
      >
        {/* 右上角更多操作按钮 */}
        <div
          className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Dropdown
            menu={{ items: menuItems }}
            trigger={["click"]}
            placement="bottomRight"
          >
            <Button
              type="text"
              icon={<MoreOutlined />}
              className="bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-800 shadow-sm"
              size="small"
            />
          </Dropdown>
        </div>

        <div className="relative h-[160px] bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
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
          ) : isPdf ? (
            <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
              <FilePdfOutlined style={{ fontSize: "2em" }} />
            </div>
          ) : isEpub ? (
            <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
              <BookOutlined style={{ fontSize: "2em" }} />
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
    <div className="flex w-full h-full overflow-hidden">
      {/* 左侧侧边栏 */}
      <ResizeableAndHideableSidebar
        width={sidebarWidth ?? 300}
        onWidthChange={setSidebarWidth}
        open={!hideSidebar}
        disableResize={false}
        className="h-full overflow-hidden"
      >
        <ResourceManagementSidebar onFoldSidebar={onFoldSidebar} />
      </ResizeableAndHideableSidebar>

      {/* 中间主内容区 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-6 py-4"
        >
          {displayedResources.length === 0 ? (
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
      </div>

      {/* 右侧详情侧边栏 */}
      <ResourceDetailSidebar
        resource={selectedResource}
        open={!!selectedResource}
        width={detailSidebarWidth}
        onWidthChange={setDetailSidebarWidth}
        onClose={() => setSelectedResource(null)}
      />

      {/* 侧边栏折叠按钮 */}
      <AnimatePresence>
        {hideSidebar && (
          <motion.div
            className="absolute top-5 left-5 z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <SVG
              className="cursor-pointer"
              src={rightSidebarIcon}
              onClick={onFoldSidebar}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 重命名弹窗 */}
      <Modal
        title="修改资源名称"
        open={renameModalVisible}
        onOk={handleConfirmRename}
        onCancel={handleCancelRename}
        okText="确定"
        cancelText="取消"
        width={480}
      >
        <div className="py-4">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            资源名称
          </div>
          <Input
            value={newResourceName}
            onChange={(e) => setNewResourceName(e.target.value)}
            onPressEnter={handleConfirmRename}
            className="h-10"
            placeholder="请输入资源名称"
            autoFocus
          />
        </div>
      </Modal>
    </div>
  );
});

export default ResourceManagement;
