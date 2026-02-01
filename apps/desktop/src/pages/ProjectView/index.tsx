import ProjectList from "./ProjectList";
import EditProjectView from "./EditProjectView";
import DataTableProjectView from "./DataTableProjectView";
import VibeLearningView from "@/pages/VibeLearningView";
import { Empty, Button } from "antd";
import ProjectContext from "./ProjectContext";
import { useState } from "react";
import { Project, EProjectType } from "@/types";
import { getProjectById } from "@/commands";
import { LoadingOutlined } from "@ant-design/icons";
import useTabParams from "@/hooks/useTabParams";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";

const ProjectView = () => {
  const { id, itemId } = useTabParams(TabType.ProjectDetail);

  const navigateTo = useTabStore((state) => state.navigateTo);

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  // 在数据库连接或切换时加载项目
  useDatabaseChangeEffect(() => {
    setLoading(true);
    getProjectById(Number(id))
      .then((project) => {
        setProject(project);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <LoadingOutlined />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Empty
          description="项目不存在或已被删除"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button
            type="primary"
            onClick={() => navigateTo(TabType.ProjectList)}
          >
            返回项目列表
          </Button>
        </Empty>
      </div>
    );
  }

  // 数据表格类型的项目直接渲染数据表格
  if (project.projectType === EProjectType.DataTable) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <DataTableProjectView projectId={Number(id)} />
      </div>
    );
  }

  // Vibe Learning 类型的项目渲染专属视图
  if (project.projectType === EProjectType.VibeLearning) {
    return <VibeLearningView />;
  }

  // 文档树类型的项目渲染原有的布局
  return (
    <ProjectContext.Provider
      value={{
        projectId: Number(id),
        itemId: itemId,
      }}
    >
      <div className="w-full h-full flex">
        <div className="h-full overflow-hidden border-r border-[#f0f0f0] dark:border-[#2a2a2a]">
          <ProjectList />
        </div>

        <div className="flex-1 h-full flex flex-col overflow-hidden">
          <div className="w-full flex-1 overflow-hidden">
            <EditProjectView />
          </div>
        </div>
      </div>
    </ProjectContext.Provider>
  );
};

export default ProjectView;
