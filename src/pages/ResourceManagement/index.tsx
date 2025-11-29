import { memo, useState, useEffect, useRef } from "react";
import { App, Dropdown, Modal } from "antd";
import type { MenuProps } from "antd";
import {
  AiOutlineFileImage,
  AiOutlineVideoCamera,
  AiOutlineAudio,
  AiOutlineFilePdf,
  AiOutlineBook,
  AiOutlineFile,
  AiOutlineMore,
} from "react-icons/ai";
import { HiOutlinePhotograph } from "react-icons/hi";
import classNames from "classnames";
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
import useThemeColors from "@/hooks/useThemeColors";
import useBackgroundMode from "@/hooks/useBackgroundMode";

const ResourceManagement = memo(() => {
  const { message } = App.useApp();
  const themeColors = useThemeColors();
  const { isGradient } = useBackgroundMode();

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
      icon: <AiOutlineFile />,
      color: "default",
    },
    {
      type: "image",
      label: "图片",
      icon: <AiOutlineFileImage />,
      color: "blue",
    },
    {
      type: "video",
      label: "视频",
      icon: <AiOutlineVideoCamera />,
      color: "green",
    },
    {
      type: "audio",
      label: "音频",
      icon: <AiOutlineAudio />,
      color: "orange",
    },
    {
      type: "pdf",
      label: "PDF",
      icon: <AiOutlineFilePdf />,
      color: "red",
    },
    {
      type: "epub",
      label: "EPUB",
      icon: <AiOutlineBook />,
      color: "volcano",
    },
    {
      type: "attachment",
      label: "附件",
      icon: <AiOutlineFile />,
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

    const typeConfig = typeConfigs.find((c) => c.type === resource.type);

    return (
      <div
        key={resource.id}
        className={classNames(
          "rounded-xl shadow-sm hover:shadow-md transition-all overflow-hidden cursor-pointer border relative group",
          isGradient
            ? "bg-white/50 dark:bg-black/30 backdrop-blur-xl backdrop-saturate-150 border-white/40 dark:border-white/10"
            : classNames(themeColors.cardBgClass, themeColors.cardBorderClass),
        )}
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
            <button
              className={classNames(
                "w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer",
                isGradient
                  ? "bg-white/80 dark:bg-black/50 hover:bg-white dark:hover:bg-black/70"
                  : "bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700",
                themeColors.textClass,
              )}
            >
              <AiOutlineMore />
            </button>
          </Dropdown>
        </div>

        <div
          className={classNames(
            "relative h-[160px] flex items-center justify-center",
            isGradient
              ? "bg-black/5 dark:bg-white/5"
              : "bg-gray-100 dark:bg-gray-700",
          )}
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
            <div
              className={classNames("text-3xl", themeColors.secondaryTextClass)}
            >
              <AiOutlineAudio />
            </div>
          ) : isPdf ? (
            <div
              className={classNames("text-3xl", themeColors.secondaryTextClass)}
            >
              <AiOutlineFilePdf />
            </div>
          ) : isEpub ? (
            <div
              className={classNames("text-3xl", themeColors.secondaryTextClass)}
            >
              <AiOutlineBook />
            </div>
          ) : (
            <div
              className={classNames("text-3xl", themeColors.secondaryTextClass)}
            >
              <AiOutlineFile />
            </div>
          )}
        </div>

        {/* 信息区 */}
        <div className="p-3">
          <div
            className={classNames(
              "text-sm font-medium truncate mb-1",
              themeColors.activeTextClass,
            )}
          >
            {resource.name}
          </div>
          <div
            className={classNames(
              "flex items-center justify-between text-xs",
              themeColors.secondaryTextClass,
            )}
          >
            <span>引用 {resource.refCount} 次</span>
            <span
              className={classNames(
                "px-1.5 py-0.5 rounded text-xs",
                themeColors.tagBgClass,
                themeColors.tagTextClass,
              )}
            >
              {typeConfig?.label}
            </span>
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
            <div className="flex flex-col items-center justify-center h-full py-12">
              <div
                className={classNames(
                  "w-20 h-20 rounded-full flex items-center justify-center mb-4",
                  themeColors.tagBgClass,
                )}
              >
                <HiOutlinePhotograph
                  className={classNames(
                    "text-4xl",
                    themeColors.secondaryTextClass,
                  )}
                />
              </div>
              <p className={classNames("text-sm", themeColors.textClass)}>
                暂无资源
              </p>
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
          <div className={classNames("text-sm mb-2", themeColors.textClass)}>
            资源名称
          </div>
          <input
            value={newResourceName}
            onChange={(e) => setNewResourceName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConfirmRename()}
            placeholder="请输入资源名称"
            autoFocus
            className={classNames(
              "w-full px-4 py-3 rounded-xl text-sm outline-none transition-all",
              "bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-700",
              "text-gray-800 dark:text-white shadow-inner",
              "placeholder:text-gray-400 dark:placeholder:text-slate-500",
              "focus:border-blue-500 focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.05),0_0_0_3px_rgba(59,130,246,0.15)]",
              "dark:focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),0_0_0_3px_rgba(59,130,246,0.25)]",
            )}
          />
        </div>
      </Modal>
    </div>
  );
});

export default ResourceManagement;
