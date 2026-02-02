import { memo, useState, useRef, useEffect, useCallback } from "react";
import { Empty, Spin, message } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { useMemoizedFn } from "ahooks";
import useTabParams from "@/hooks/useTabParams";
import useSettingStore from "@/stores/useSettingStore";
import { TabType } from "@/types/tab";
import { getProjectById } from "@/commands";
import { getVLResourcesByProjectId } from "@/commands/vibe-learning";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import {
  BlockPreviewProvider,
  useBlockPreview,
} from "@/contexts/BlockPreviewContext";
import BlockPreviewSidebar from "@/components/BlockPreviewSidebar";
import ResizablePanel from "@/components/ResizablePanel";
import type { Project } from "@/types";
import type { VLResource } from "@/types/vibe-learning";

import ResourcePanel from "./ResourcePanel";
import ChatPanel from "./ChatPanel";
import AppSidebar from "./AppSidebar";

// AppSidebar 宽度相关常量
const APP_SIDEBAR_MIN_WIDTH = 280;
const APP_SIDEBAR_MAX_WIDTH = 500;
const APP_SIDEBAR_DEFAULT_WIDTH = 320;
const APP_SIDEBAR_STORAGE_KEY = "vibe-learning-app-sidebar-width";

const VibeLearningViewContent = memo(() => {
  const { id } = useTabParams(TabType.VibeLearning);
  const projectId = Number(id);

  const mainDbName = useSettingStore((state) => state.setting.database.active);
  const { state: previewState } = useBlockPreview();

  const [project, setProject] = useState<Project | null>(null);
  const [resources, setResources] = useState<VLResource[]>([]);
  const [loading, setLoading] = useState(true);

  // AppSidebar 宽度状态
  const [appSidebarWidth, setAppSidebarWidth] = useState(() => {
    if (typeof window === "undefined") return APP_SIDEBAR_DEFAULT_WIDTH;
    const saved = localStorage.getItem(APP_SIDEBAR_STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (
        !isNaN(parsed) &&
        parsed >= APP_SIDEBAR_MIN_WIDTH &&
        parsed <= APP_SIDEBAR_MAX_WIDTH
      ) {
        return parsed;
      }
    }
    return APP_SIDEBAR_DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // 处理拖拽开始
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeRef.current = {
        startX: e.clientX,
        startWidth: appSidebarWidth,
      };
      setIsResizing(true);
    },
    [appSidebarWidth],
  );

  // 处理拖拽过程
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      // 向左拖动增加宽度，向右拖动减少宽度
      const delta = resizeRef.current.startX - e.clientX;
      const newWidth = Math.min(
        APP_SIDEBAR_MAX_WIDTH,
        Math.max(APP_SIDEBAR_MIN_WIDTH, resizeRef.current.startWidth + delta),
      );
      setAppSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (resizeRef.current) {
        // 保存宽度到 localStorage
        localStorage.setItem(
          APP_SIDEBAR_STORAGE_KEY,
          appSidebarWidth.toString(),
        );
      }
      resizeRef.current = null;
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, appSidebarWidth]);

  // 加载项目和资源
  const loadData = useMemoizedFn(async () => {
    if (!projectId || isNaN(projectId)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [projectData, resourcesData] = await Promise.all([
        getProjectById(projectId),
        getVLResourcesByProjectId(projectId),
      ]);
      setProject(projectData);
      setResources(resourcesData);
    } catch (error) {
      console.error("Failed to load VibeLearning data:", error);
      message.error("加载项目数据失败");
    } finally {
      setLoading(false);
    }
  });

  // 数据库切换时重新加载
  useDatabaseChangeEffect(() => {
    loadData();
  }, [projectId]);

  // 刷新资源列表
  const refreshResources = useMemoizedFn(async () => {
    try {
      const resourcesData = await getVLResourcesByProjectId(projectId);
      setResources(resourcesData);
    } catch (error) {
      console.error("Failed to refresh resources:", error);
    }
  });

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spin indicator={<LoadingOutlined spin />} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Empty description="项目不存在或已被删除" />
      </div>
    );
  }

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* 左侧资料面板 */}
      <div className="w-80 min-w-[280px] max-w-[400px] h-full border-r border-[#e8e8e8] dark:border-[#2a2a2a] overflow-hidden flex flex-col shrink-0">
        <ResourcePanel
          projectId={projectId}
          mainDbName={mainDbName}
          resources={resources}
          onResourcesChange={refreshResources}
        />
      </div>

      {/* 中间聊天面板 */}
      <ResizablePanel
        id="vibe-learning-chat-panel"
        className="flex h-full flex-1 min-w-0"
        left={
          <div className="flex-1 h-full overflow-hidden flex flex-col">
            <ChatPanel projectId={projectId} mainDbName={mainDbName} />
          </div>
        }
        right={previewState.isOpen ? <BlockPreviewSidebar /> : null}
        initialLeftRatio={0.65}
        minLeft={400}
        minRight={400}
      />

      {/* 右侧应用侧边栏 */}
      <div
        className="h-full overflow-hidden flex shrink-0"
        style={{ width: appSidebarWidth }}
      >
        {/* 拖拽手柄 */}
        <div
          className="w-1 h-full cursor-col-resize flex items-center justify-center hover:bg-blue-500/20 transition-colors group"
          onMouseDown={handleResizeStart}
        >
          <div
            className={`w-0.5 h-8 rounded-full transition-colors ${isResizing ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600 group-hover:bg-blue-500"}`}
          />
        </div>
        {/* 侧边栏内容 */}
        <div
          className={`flex-1 h-full overflow-hidden flex flex-col ${isResizing ? "pointer-events-none select-none" : ""}`}
        >
          <AppSidebar projectId={projectId} mainDbName={mainDbName} />
        </div>
      </div>
    </div>
  );
});

const VibeLearningView = memo(() => {
  return (
    <BlockPreviewProvider>
      <VibeLearningViewContent />
    </BlockPreviewProvider>
  );
});

export default VibeLearningView;
