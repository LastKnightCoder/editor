import { memo, useState } from "react";
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

const VibeLearningViewContent = memo(() => {
  const { id } = useTabParams(TabType.VibeLearning);
  const projectId = Number(id);

  const mainDbName = useSettingStore((state) => state.setting.database.active);
  const { state: previewState } = useBlockPreview();

  const [project, setProject] = useState<Project | null>(null);
  const [resources, setResources] = useState<VLResource[]>([]);
  const [loading, setLoading] = useState(true);

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
      <div className="w-80 min-w-[280px] max-w-[400px] h-full overflow-hidden flex flex-col shrink-0">
        <AppSidebar projectId={projectId} mainDbName={mainDbName} />
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
