import ProjectList from "./ProjectList";
import classnames from "classnames";

import EditProjectView from "./EditProjectView";
import styles from "./index.module.less";
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
      <div className={styles.loading}>
        <LoadingOutlined />
      </div>
    );
  }

  if (!project) {
    return (
      <div className={styles.empty}>
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
      <div className={classnames(styles.viewContainer)}>
        <div className={classnames(styles.sidebar)}>
          <ProjectList />
        </div>

        <div className={styles.edit}>
          <div className={styles.editorContainer}>
            <EditProjectView />
          </div>
        </div>
      </div>
    </ProjectContext.Provider>
  );
};

export default ProjectView;
