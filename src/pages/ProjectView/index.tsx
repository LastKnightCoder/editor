import ProjectList from "./ProjectList";
import EditProjectView from "./EditProjectView";
import { Empty, Button } from "antd";
import ProjectContext from "./ProjectContext";
import { useState, useEffect } from "react";
import { Project } from "@/types";
import { getProjectById } from "@/commands";
import { LoadingOutlined } from "@ant-design/icons";
import useTabParams from "@/hooks/useTabParams";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";

const ProjectView = () => {
  const { id, itemId } = useTabParams(TabType.ProjectDetail);

  console.log("ProjectView itemId", itemId);

  const navigateTo = useTabStore((state) => state.navigateTo);

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
