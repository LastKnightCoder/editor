import ProjectList from "./ProjectList";
import EditProjectView from "./EditProjectView";
import DataTableProjectView from "./DataTableProjectView";
import VibeLearningView from "../VibeLearningView";
import { Button } from "@tau/ui";
import ProjectContext from "./ProjectContext";
import { useEffect, useRef, useState } from "react";
import { Project, EProjectType } from "@/types";
import { getProjectById } from "@/commands";
import { Loader2 } from "lucide-react";
import { usePage } from "@/page/PageProvider";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";

interface ProjectViewProps {
  projectId: number;
  /** 定位到文档树内具体条目（命令面板/外部跳转用，列表进入不带） */
  itemId?: number;
}

const ProjectView = ({ projectId, itemId }: ProjectViewProps) => {
  const { navigator } = usePage();

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
        <Loader2 className="size-5 animate-spin" strokeWidth={1.75} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="bg-surface shadow-card rounded-tau-lg flex flex-col items-center gap-3 px-8 py-7 text-center">
          <p className="text-ink-1 text-[15px] font-medium">项目不存在或已被删除</p>
          <Button variant="secondary" size="sm" onClick={() => navigator.back()}>
            返回项目列表
          </Button>
        </div>
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
        itemId: itemId,
        containerWidth,
      }}
    >
      <div ref={containerRef} className="flex h-full w-full">
        <div className="border-line-1 h-full overflow-hidden border-r">
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
