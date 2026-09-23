import ProjectList from "./ProjectList";
import EditProjectView from "./EditProjectView";
import DataTableProjectView from "./DataTableProjectView";
import VibeLearningView from "../VibeLearningView";
import { Empty, Button } from "antd";
import ProjectContext from "./ProjectContext";
import { useEffect, useRef, useState } from "react";
import { Project, EProjectType } from "@/types";
import { getProjectById } from "@/commands";
import { LoadingOutlined } from "@ant-design/icons";
import { usePage } from "@/page/PageProvider";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";

interface ProjectViewProps {
  projectId: number;
  /** 定位到文档树内具体条目（命令面板/外部跳转用，列表进入不带） */
  itemId?: number;
}

const ProjectView = ({ projectId, itemId }: ProjectViewProps) => {
  const { navigator } = usePage();
  /* 选中条目：初始来自外部定位（props.itemId），后续由树节点点击/新建经
     setActiveItemId 本地更新；push 异参原位更新 props 时同步回落 */
  const [activeItemId, setActiveItemId] = useState(itemId);
  useEffect(() => {
    setActiveItemId(itemId);
  }, [itemId]);

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setContainerWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [project]);

  // 在数据库连接或切换时加载项目
  useDatabaseChangeEffect(() => {
    setLoading(true);
    getProjectById(projectId)
      .then(project => {
        setProject(project);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <LoadingOutlined />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Empty description="项目不存在或已被删除" image={Empty.PRESENTED_IMAGE_SIMPLE}>
          <Button type="primary" onClick={() => navigator.back()}>
            返回项目列表
          </Button>
        </Empty>
      </div>
    );
  }

  // 数据表格类型的项目直接渲染数据表格
  if (project.projectType === EProjectType.DataTable) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <DataTableProjectView projectId={projectId} />
      </div>
    );
  }

  // Vibe Learning 类型的项目渲染专属视图
  if (project.projectType === EProjectType.VibeLearning) {
    return <VibeLearningView projectId={projectId} />;
  }

  // 文档树类型的项目渲染原有的布局
  return (
    <ProjectContext.Provider
      value={{
        projectId: projectId,
        itemId: activeItemId,
        containerWidth,
        setActiveItemId,
      }}
    >
      <div ref={containerRef} className="flex h-full w-full">
        <div className="h-full overflow-hidden border-r border-[#f0f0f0] dark:border-[#2a2a2a]">
          <ProjectList />
        </div>

        <div className="flex h-full flex-1 flex-col overflow-hidden">
          <div className="w-full flex-1 overflow-hidden">
            <EditProjectView />
          </div>
        </div>
      </div>
    </ProjectContext.Provider>
  );
};

export default ProjectView;
