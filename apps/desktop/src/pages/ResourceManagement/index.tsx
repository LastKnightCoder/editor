import { memo, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { App, Dropdown } from "antd";
import type { MenuProps } from "antd";
import {
  Pencil,
  FolderInput,
  FolderOpen,
  Copy,
  Trash2,
  Eye,
  Upload,
  RefreshCw,
  Files,
} from "lucide-react";
import classNames from "classnames";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useShallow } from "zustand/react/shallow";
import { useMemoizedFn, useLocalStorageState } from "ahooks";
import { AnimatePresence, motion } from "motion/react";
import SVG from "react-inlinesvg";
import rightSidebarIcon from "@/assets/icons/sidebar-right.svg";
import useResourceStore from "@/stores/useResourceStore";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import {
  updateResourceName,
  scanAndUpdateResources,
  showInFolder,
  getHomeDir,
} from "@/commands";
import { IResource } from "@/types";
import { remoteResourceToLocal } from "@/utils";
import ImageGallery from "@/components/ImageGallery";
import ResourceDetailSidebar from "./components/ResourceDetailSidebar";
import ResourceManagementSidebar from "./components/ResourceManagementSidebar";
import ResourceToolbar from "./components/ResourceToolbar";
import ResourceCard from "./components/ResourceCard";
import ResourceListView from "./components/ResourceListView";
import BatchOperationBar from "./components/BatchOperationBar";
import { useResourceUploadDialog } from "./components/useResourceUploadDialog";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import useThemeColors from "@/hooks/useThemeColors";
import CustomModal from "@/components/CustomModal";
import { getResourceTypeConfig, SOURCE_TYPE_MAP } from "./constants";

interface ContextMenuState {
  resource: IResource;
  x: number;
  y: number;
}

const ResourceManagement = memo(() => {
  const { message } = App.useApp();
  const app = App.useApp();
  const themeColors = useThemeColors();

  const {
    resources,
    groups,
    selectedResourceId,
    selectedResourceIds,
    selectedGroupId,
    selectedSystemFilter,
    searchKeyword,
    viewMode,
    sortBy,
    sortOrder,
    initResources,
    initResourceGroups,
    moveResourceToGroup,
    refreshResources,
    toggleResourceSelected,
    setSelectedResourceIds,
    clearResourceSelection,
    deleteResources,
  } = useResourceStore(
    useShallow((state) => ({
      resources: state.resources,
      groups: state.groups,
      selectedResourceId: state.selectedResourceId,
      selectedResourceIds: state.selectedResourceIds,
      selectedGroupId: state.selectedGroupId,
      selectedSystemFilter: state.selectedSystemFilter,
      searchKeyword: state.searchKeyword,
      viewMode: state.viewMode,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
      initResources: state.initResources,
      initResourceGroups: state.initResourceGroups,
      moveResourceToGroup: state.moveResourceToGroup,
      refreshResources: state.refreshResources,
      toggleResourceSelected: state.toggleResourceSelected,
      setSelectedResourceIds: state.setSelectedResourceIds,
      clearResourceSelection: state.clearResourceSelection,
      deleteResources: state.deleteResources,
    })),
  );

  const [hideSidebar, setHideSidebar] = useLocalStorageState(
    "resource-management-hide-sidebar",
    { defaultValue: false },
  );

  const [sidebarWidth, setSidebarWidth] = useLocalStorageState(
    "resource-management-sidebar-width",
    { defaultValue: 300 },
  );

  const [detailSidebarWidth, setDetailSidebarWidth] = useState(480);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renamingResource, setRenamingResource] = useState<IResource | null>(
    null,
  );
  const [newResourceName, setNewResourceName] = useState("");
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[] | null>(
    null,
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [lightbox, setLightbox] = useState<{
    images: string[];
    index: number;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [columnsPerRow, setColumnsPerRow] = useState(4);
  const lastClickedIndexRef = useRef<number>(-1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const uploadDialog = useResourceUploadDialog({
    moveResourceToGroup,
    refreshResources,
    app,
  });

  useDatabaseChangeEffect(() => {
    initResources();
    initResourceGroups();
  });

  // ===== 过滤 + 排序 =====
  const displayedResources = useMemo(() => {
    const filtered = searchKeyword
      ? resources.filter(
          (r) =>
            r.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
            r.path.toLowerCase().includes(searchKeyword.toLowerCase()),
        )
      : resources;

    let scope = filtered;
    if (selectedGroupId !== null) {
      scope = filtered.filter((r) => r.groupId === selectedGroupId);
    } else if (selectedSystemFilter) {
      if (selectedSystemFilter.type === "type") {
        scope = filtered.filter(
          (r) => r.type === selectedSystemFilter.resourceType,
        );
      } else if (selectedSystemFilter.type === "type-source") {
        scope = filtered.filter(
          (r) =>
            r.type === selectedSystemFilter.resourceType &&
            r.sources.some((s) => s.type === selectedSystemFilter.sourceType),
        );
      }
    } else if (selectedResourceId === null) {
      // 未选中任何分类时展示"未分组"
      scope = filtered.filter((r) => !r.groupId);
    }

    return [...scope].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name, "zh");
          break;
        case "type":
          cmp = a.type.localeCompare(b.type);
          break;
        case "refCount":
          cmp = a.refCount - b.refCount;
          break;
        default:
          cmp = a.updateTime - b.updateTime;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [
    resources,
    searchKeyword,
    selectedGroupId,
    selectedSystemFilter,
    selectedResourceId,
    sortBy,
    sortOrder,
  ]);

  const selectedResource = useMemo(
    () =>
      selectedResourceId !== null
        ? (resources.find((r) => r.id === selectedResourceId) ?? null)
        : null,
    [resources, selectedResourceId],
  );

  // ===== 标题 =====
  const currentTitle = useMemo(() => {
    if (selectedGroupId !== null) {
      const group = groups.find((g) => g.id === selectedGroupId);
      return group?.name ?? "分组";
    }
    if (selectedSystemFilter) {
      if (selectedSystemFilter.type === "all") return "全部资源";
      if (selectedSystemFilter.type === "type") {
        return getResourceTypeConfig(selectedSystemFilter.resourceType).label;
      }
      const typeLabel = getResourceTypeConfig(
        selectedSystemFilter.resourceType,
      ).label;
      return `${typeLabel} · ${SOURCE_TYPE_MAP[selectedSystemFilter.sourceType].label}`;
    }
    return "未分组";
  }, [selectedGroupId, selectedSystemFilter, groups]);

  // ===== 网格列数 =====
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateColumns = () => {
      const cols = Math.floor(container.clientWidth / 220);
      setColumnsPerRow(Math.max(1, Math.min(cols, 6)));
    };

    updateColumns();
    const resizeObserver = new ResizeObserver(updateColumns);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [viewMode]);

  const rows: IResource[][] = [];
  for (let i = 0; i < displayedResources.length; i += columnsPerRow) {
    rows.push(displayedResources.slice(i, i + columnsPerRow));
  }

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 300,
    overscan: 2,
    getItemKey: (index) => rows[index]?.[0]?.id ?? index,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  const selectedIdSet = useMemo(
    () => new Set(selectedResourceIds),
    [selectedResourceIds],
  );

  // ===== 点击选择(支持 Cmd/Ctrl 多选、Shift 范围选) =====
  const handleResourceClick = useMemoizedFn(
    (resource: IResource, e: React.MouseEvent) => {
      const index = displayedResources.findIndex((r) => r.id === resource.id);

      if (e.metaKey || e.ctrlKey) {
        toggleResourceSelected(resource.id);
        lastClickedIndexRef.current = index;
        return;
      }

      if (e.shiftKey && lastClickedIndexRef.current >= 0 && index >= 0) {
        const [from, to] = [
          Math.min(lastClickedIndexRef.current, index),
          Math.max(lastClickedIndexRef.current, index),
        ];
        setSelectedResourceIds(
          displayedResources.slice(from, to + 1).map((r) => r.id),
        );
        return;
      }

      // 普通点击:清除多选,打开详情
      clearResourceSelection();
      useResourceStore.getState().setSelectedResource(resource.id);
      lastClickedIndexRef.current = index;
    },
  );

  // ===== 大图预览 =====
  const openLightbox = useMemoizedFn((resource: IResource) => {
    const imageResources = displayedResources.filter((r) => r.type === "image");
    const index = imageResources.findIndex((r) => r.id === resource.id);
    if (index >= 0) {
      setLightbox({
        images: imageResources.map((r) => r.path),
        index,
      });
    }
  });

  const handleResourceDoubleClick = useMemoizedFn((resource: IResource) => {
    if (resource.type === "image") {
      openLightbox(resource);
    }
  });

  // ===== 操作 =====
  const handleMoveToGroup = useMemoizedFn(
    async (resourceIds: number[], targetGroupId: number | null) => {
      try {
        await Promise.all(
          resourceIds.map((id) => moveResourceToGroup(id, targetGroupId)),
        );
        message.success(targetGroupId ? "已移动到分组" : "已移到未分组");
        clearResourceSelection();
      } catch (error) {
        console.error("移动失败:", error);
        message.error("移动失败");
      }
    },
  );

  const handleShowInFolder = useMemoizedFn(async (resource: IResource) => {
    try {
      if (resource.path.startsWith("http")) {
        const localPath = await remoteResourceToLocal(
          resource.path,
          resource.name,
        );
        await showInFolder(localPath);
      } else {
        const homeDir = await getHomeDir();
        const absolutePath = resource.path.startsWith("~")
          ? `${homeDir}${resource.path.slice(1)}`
          : resource.path;
        await showInFolder(absolutePath);
      }
    } catch (error) {
      console.error(error);
      message.error("文件不存在或无法打开");
    }
  });

  const handleCopyPath = useMemoizedFn(async (resource: IResource) => {
    await navigator.clipboard.writeText(resource.path);
    message.success("路径已复制");
  });

  const handleOpenRenameModal = useMemoizedFn((resource: IResource) => {
    setRenamingResource(resource);
    setNewResourceName(resource.name);
    setRenameModalVisible(true);
  });

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
    } catch (error) {
      console.error("修改名称失败:", error);
      message.error("修改名称失败");
    }
  };

  const handleScanResources = useMemoizedFn(async () => {
    setRefreshing(true);
    const hide = message.loading("正在扫描资源，请稍候...", 0);
    try {
      await scanAndUpdateResources();
      await refreshResources();
      message.success("资源扫描完成");
    } catch (error) {
      console.error("扫描资源失败:", error);
      message.error("扫描资源失败");
    } finally {
      hide();
      setRefreshing(false);
    }
  });

  const handleConfirmDelete = async () => {
    if (!pendingDeleteIds) return;
    try {
      const deleted = await deleteResources(pendingDeleteIds);
      message.success(`已删除 ${deleted} 条资源记录`);
      if (lightbox) setLightbox(null);
    } catch (error) {
      console.error("删除资源失败:", error);
      message.error("删除资源失败");
    } finally {
      setPendingDeleteIds(null);
    }
  };

  const requestDelete = useMemoizedFn((ids: number[]) => {
    if (ids.length === 0) return;
    setPendingDeleteIds(ids);
  });

  // ===== 右键 / 更多菜单 =====
  const buildGroupMenu = useCallback(
    (parentId: number | null, resourceIds: number[]): MenuProps["items"] => {
      const childGroups = groups.filter((g) => g.parentId === parentId);
      return childGroups.map((group) => ({
        key: `group-${group.id}`,
        label: group.name,
        onClick: (e) => {
          if (e.key === `group-${group.id}`) {
            e.domEvent.stopPropagation();
            handleMoveToGroup(resourceIds, group.id);
          }
        },
        children: (() => {
          const sub = buildGroupMenu(group.id, resourceIds);
          return sub && sub.length > 0 ? sub : undefined;
        })(),
      }));
    },
    [groups, handleMoveToGroup],
  );

  const buildResourceMenu = useCallback(
    (resource: IResource): MenuProps["items"] => {
      const resourceIds = selectedIdSet.has(resource.id)
        ? selectedResourceIds
        : [resource.id];
      const groupMenu = buildGroupMenu(null, resourceIds) ?? [];
      const items: MenuProps["items"] = [];

      if (resource.type === "image") {
        items.push({
          key: "preview",
          label: "预览大图",
          icon: <Eye size={14} />,
          onClick: () => openLightbox(resource),
        });
      }
      items.push({
        key: "rename",
        label: "重命名",
        icon: <Pencil size={14} />,
        onClick: () => handleOpenRenameModal(resource),
      });
      items.push({
        key: "move-to-group",
        label: "移动到分组",
        icon: <FolderInput size={14} />,
        children:
          groupMenu.length > 0
            ? [
                {
                  key: "ungrouped",
                  label: "未分组",
                  onClick: (e) => {
                    e.domEvent.stopPropagation();
                    handleMoveToGroup(resourceIds, null);
                  },
                },
                ...groupMenu,
              ]
            : [
                {
                  key: "ungrouped",
                  label: "移到未分组",
                  onClick: (e) => {
                    e.domEvent.stopPropagation();
                    handleMoveToGroup(resourceIds, null);
                  },
                },
              ],
      });
      items.push({
        key: "show-in-folder",
        label: "在文件夹中显示",
        icon: <FolderOpen size={14} />,
        onClick: () => handleShowInFolder(resource),
      });
      items.push({
        key: "copy-path",
        label: "复制路径",
        icon: <Copy size={14} />,
        onClick: () => handleCopyPath(resource),
      });
      items.push({
        key: "delete",
        label: `删除${resourceIds.length > 1 ? ` (${resourceIds.length} 项)` : ""}`,
        icon: <Trash2 size={14} />,
        danger: true,
        onClick: () => requestDelete(resourceIds),
      });
      return items;
    },
    [
      selectedResourceIds,
      selectedIdSet,
      buildGroupMenu,
      openLightbox,
      handleOpenRenameModal,
      handleShowInFolder,
      handleCopyPath,
      handleMoveToGroup,
      requestDelete,
    ],
  );

  const handleContextMenu = useMemoizedFn(
    (resource: IResource, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // 右键未选中的资源时,先将其设为唯一选中
      if (!selectedIdSet.has(resource.id)) {
        setSelectedResourceIds([resource.id]);
      }
      setContextMenu({ resource, x: e.clientX, y: e.clientY });
    },
  );

  const handleMoreClick = useMemoizedFn(
    (resource: IResource, e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setContextMenu({ resource, x: rect.left, y: rect.bottom + 4 });
    },
  );

  // ===== 快捷键 =====
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "Escape") {
        if (lightbox) setLightbox(null);
        else clearResourceSelection();
        return;
      }
      if (lightbox) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedResourceIds(displayedResources.map((r) => r.id));
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedResourceIds.length > 0) {
          e.preventDefault();
          requestDelete(selectedResourceIds);
        }
        return;
      }
      if (e.key === " ") {
        const active = displayedResources.find(
          (r) => r.id === selectedResourceId,
        );
        if (active?.type === "image") {
          e.preventDefault();
          openLightbox(active);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    displayedResources,
    selectedResourceIds,
    selectedResourceId,
    lightbox,
    clearResourceSelection,
    setSelectedResourceIds,
    requestDelete,
    openLightbox,
  ]);

  const onFoldSidebar = useMemoizedFn(() => {
    setHideSidebar(!hideSidebar);
  });

  const batchGroupMenuItems = useMemo(() => {
    const base = buildGroupMenu(null, selectedResourceIds) ?? [];
    return base.length > 0
      ? [
          {
            key: "ungrouped",
            label: "未分组",
            onClick: (e: Parameters<NonNullable<MenuProps["onClick"]>>[0]) => {
              e.domEvent.stopPropagation();
              handleMoveToGroup(selectedResourceIds, null);
            },
          },
          ...base,
        ]
      : [];
  }, [buildGroupMenu, selectedResourceIds, handleMoveToGroup]);

  return (
    <div className="relative flex w-full h-full overflow-hidden">
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
        <ResourceToolbar
          title={currentTitle}
          count={displayedResources.length}
          onUpload={() => uploadDialog.handleOpenUploadResource(null)}
          onRefresh={handleScanResources}
          refreshing={refreshing}
        />

        {/* 批量操作条 */}
        <BatchOperationBar
          count={selectedResourceIds.length}
          groupMenuItems={batchGroupMenuItems}
          onDelete={() => requestDelete(selectedResourceIds)}
          onCancel={clearResourceSelection}
        />

        {displayedResources.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 gap-4">
            <div
              className={classNames(
                "w-20 h-20 rounded-full flex items-center justify-center",
                themeColors.tagBgClass,
              )}
            >
              <Files
                className={classNames(
                  "text-4xl",
                  themeColors.secondaryTextClass,
                )}
                strokeWidth={1.2}
              />
            </div>
            <p className={classNames("text-sm", themeColors.textClass)}>
              {searchKeyword ? "未找到匹配的资源" : "暂无资源"}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => uploadDialog.handleOpenUploadResource(null)}
                className={classNames(
                  "h-8 px-3 rounded-lg flex items-center gap-1.5 text-sm cursor-pointer",
                  themeColors.primaryButtonClass,
                )}
              >
                <Upload size={14} />
                上传资源
              </button>
              <button
                onClick={handleScanResources}
                className={classNames(
                  "h-8 px-3 rounded-lg flex items-center gap-1.5 text-sm cursor-pointer border",
                  themeColors.borderClass,
                  themeColors.hoverClass,
                  themeColors.textClass,
                )}
              >
                <RefreshCw size={14} />
                刷新资源
              </button>
            </div>
          </div>
        ) : viewMode === "list" ? (
          <ResourceListView
            resources={displayedResources}
            groups={groups}
            selectedIds={selectedIdSet}
            activeId={selectedResourceId}
            onClick={handleResourceClick}
            onDoubleClick={handleResourceDoubleClick}
            onContextMenu={handleContextMenu}
          />
        ) : (
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto px-6 py-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) clearResourceSelection();
            }}
          >
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
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div
                      className="grid gap-x-4 gap-y-3 pb-3"
                      style={{
                        gridTemplateColumns: `repeat(${columnsPerRow}, 1fr)`,
                      }}
                    >
                      {rowResources.map((resource) => (
                        <ResourceCard
                          key={resource.id}
                          resource={resource}
                          selected={selectedIdSet.has(resource.id)}
                          active={selectedResourceId === resource.id}
                          onClick={handleResourceClick}
                          onDoubleClick={handleResourceDoubleClick}
                          onContextMenu={handleContextMenu}
                          onMoreClick={handleMoreClick}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 右侧详情侧边栏 */}
      <ResourceDetailSidebar
        resource={selectedResource}
        open={!!selectedResource}
        width={detailSidebarWidth}
        onWidthChange={setDetailSidebarWidth}
        onClose={() => useResourceStore.getState().setSelectedResource(null)}
      />

      {/* 右键 / 更多菜单(受控定位) */}
      {contextMenu && (
        <Dropdown
          menu={{ items: buildResourceMenu(contextMenu.resource) }}
          open
          onOpenChange={(open) => {
            if (!open) setContextMenu(null);
          }}
        >
          <div
            style={{
              position: "fixed",
              left: contextMenu.x,
              top: contextMenu.y,
              width: 0,
              height: 0,
            }}
          />
        </Dropdown>
      )}

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

      {/* 大图预览 */}
      {lightbox && (
        <ImageGallery
          images={lightbox.images}
          open
          defaultIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* 重命名弹窗 */}
      <CustomModal
        title="重命名资源"
        open={renameModalVisible}
        onOk={handleConfirmRename}
        onCancel={() => {
          setRenameModalVisible(false);
          setRenamingResource(null);
          setNewResourceName("");
        }}
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
              "w-full h-10 px-4 rounded-lg text-sm outline-none transition-all",
              themeColors.inputBgClass,
              "border",
              themeColors.borderClass,
              themeColors.textClass,
              "focus:border-[var(--th-border-focus)] focus:[box-shadow:var(--th-focus-ring)]",
            )}
          />
        </div>
      </CustomModal>

      {/* 删除确认弹窗 */}
      <CustomModal
        title={`删除 ${pendingDeleteIds?.length ?? 0} 项资源?`}
        open={pendingDeleteIds !== null}
        onOk={handleConfirmDelete}
        onCancel={() => setPendingDeleteIds(null)}
        okText="删除"
        cancelText="取消"
        width={480}
      >
        <div
          className={classNames("py-4 text-sm", themeColors.secondaryTextClass)}
        >
          仅移除资源记录,不会删除源文件;若资源仍被文档等内容引用,重新扫描后会再次出现。
        </div>
      </CustomModal>

      {/* 上传弹窗 */}
      <CustomModal
        title="上传资源"
        open={uploadDialog.uploadDialogVisible}
        onOk={uploadDialog.handleUploadDialogOk}
        onCancel={uploadDialog.closeUploadDialog}
        okText="上传"
        cancelText="取消"
        confirmLoading={uploadDialog.uploadingResource}
      >
        <div className="flex flex-col gap-3">
          <input type="file" onChange={uploadDialog.handleUploadFileChange} />
          <input
            placeholder="请输入资源名称（默认为文件名）"
            value={uploadDialog.uploadResourceName}
            onChange={(e) => uploadDialog.setUploadResourceName(e.target.value)}
            className={classNames(
              "w-full h-10 px-4 rounded-lg text-sm outline-none transition-all",
              themeColors.inputBgClass,
              "border",
              themeColors.borderClass,
              themeColors.textClass,
              "focus:border-[var(--th-border-focus)] focus:[box-shadow:var(--th-focus-ring)]",
            )}
          />
        </div>
      </CustomModal>
    </div>
  );
});

export default ResourceManagement;
