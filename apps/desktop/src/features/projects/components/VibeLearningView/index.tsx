import { memo, useState, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useMemoizedFn, useLocalStorageState } from "ahooks";
import useSettingStore from "@/stores/useSettingStore";
import { getProjectById } from "@/commands";
import { getVLResourcesByProjectId } from "@/commands/vibe-learning";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import { BlockPreviewProvider, useBlockPreview } from "@/contexts/BlockPreviewContext";
import BlockPreviewSidebar from "@/components/BlockPreviewSidebar";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import SidebarToggleButton from "@/components/SidebarToggleButton";
import type { Project } from "@/types";
import type { VLResource } from "@/types/vibe-learning";

import ResourcePanel from "./ResourcePanel";
import ChatPanel from "./ChatPanel";
import AppSidebar, { type AppSidebarRef } from "./AppSidebar";
import { toast } from "@tau/ui";

interface VibeLearningViewProps {
  projectId: number;
}

const VibeLearningViewContent = memo(({ projectId }: VibeLearningViewProps) => {
  const mainDbName = useSettingStore(state => state.setting.database.active);
  const { state: previewState } = useBlockPreview();

  const [project, setProject] = useState<Project | null>(null);
  const [resources, setResources] = useState<VLResource[]>([]);
  const [loading, setLoading] = useState(true);

  // 左侧资源面板宽度和隐藏状态
  const [resourcePanelWidth, setResourcePanelWidth] = useLocalStorageState(
    "vibe-learning-resource-panel-width",
    { defaultValue: 320 }
  );
  const [hideResourcePanel, setHideResourcePanel] = useState(false);

  // 右侧应用侧边栏宽度和隐藏状态
  const [appSidebarWidth, setAppSidebarWidth] = useLocalStorageState(
    "vibe-learning-app-sidebar-width",
    { defaultValue: 320 }
  );
  const [hideAppSidebar, setHideAppSidebar] = useState(false);

  const appSidebarRef = useRef<AppSidebarRef>(null);

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
      toast.error("加载项目数据失败");
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
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.75} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="bg-surface shadow-card rounded-tau-lg px-8 py-6 text-center">
          <p className="text-ink-2 text-[14px]">项目不存在或已被删除</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      {/* 左侧资料面板 */}
      <ResizeableAndHideableSidebar
        width={resourcePanelWidth ?? 320}
        onWidthChange={setResourcePanelWidth}
        open={!hideResourcePanel}
        onToggle={() => setHideResourcePanel(!hideResourcePanel)}
        sidebarPosition="left"
        minWidth={280}
        maxWidth={600}
        className="border-line-1 h-full shrink-0 overflow-hidden border-r"
      >
        <ResourcePanel
          projectId={projectId}
          mainDbName={mainDbName}
          resources={resources}
          onResourcesChange={refreshResources}
        />
      </ResizeableAndHideableSidebar>
      <SidebarToggleButton.Expand
        isHidden={hideResourcePanel}
        onToggle={() => setHideResourcePanel(!hideResourcePanel)}
        side="left"
      />

      {/* 中间聊天面板 */}
      <div className="flex h-full min-w-0 flex-1 overflow-hidden">
        <div className="flex h-full flex-1 flex-col overflow-hidden">
          <ChatPanel projectId={projectId} mainDbName={mainDbName} resources={resources} />
        </div>
        {previewState.isOpen && <BlockPreviewSidebar />}
      </div>

      {/* 右侧应用侧边栏 */}
      <ResizeableAndHideableSidebar
        width={appSidebarWidth ?? 320}
        onWidthChange={setAppSidebarWidth}
        open={!hideAppSidebar}
        onToggle={() => setHideAppSidebar(!hideAppSidebar)}
        sidebarPosition="right"
        side="left"
        minWidth={280}
        maxWidth={600}
        className="border-line-1 h-full shrink-0 overflow-hidden border-l"
      >
        <AppSidebar
          ref={appSidebarRef}
          projectId={projectId}
          mainDbName={mainDbName}
          onResourcesChange={refreshResources}
        />
      </ResizeableAndHideableSidebar>
      <SidebarToggleButton.Expand
        isHidden={hideAppSidebar}
        onToggle={() => setHideAppSidebar(!hideAppSidebar)}
        side="right"
      />
    </div>
  );
});

const VibeLearningView = memo(({ projectId }: VibeLearningViewProps) => {
  return (
    <BlockPreviewProvider>
      <VibeLearningViewContent projectId={projectId} />
    </BlockPreviewProvider>
  );
});

export default VibeLearningView;
