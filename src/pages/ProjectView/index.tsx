import ProjectList from "./ProjectList";
import classnames from "classnames";
import { useNavigate } from "react-router-dom";

import EditProjectView from "./EditProjectView";
import styles from "./index.module.less";
import { useParams } from "react-router-dom";
import { Breadcrumb, Empty } from "antd";
import ProjectContext from "./ProjectContext";
import Titlebar from "@/layouts/components/Titlebar";

const ProjectView = () => {
  const { id } = useParams();

  const navigate = useNavigate();

  const breadcrumbItems = [
    { title: "首页", path: "/" },
    { title: "项目列表", path: "/projects/list" },
    { title: `项目详情 #${id}`, path: `/projects/detail/${id}` },
  ];

  if (!id) {
    return (
      <div>
        <Empty description="项目不存在或已被删除" />
      </div>
    );
  }

  return (
    <ProjectContext.Provider
      value={{
        projectId: Number(id),
      }}
    >
      <div className={classnames(styles.viewContainer)}>
        <div className={classnames(styles.sidebar)}>
          <ProjectList />
        </div>
        <div className={styles.edit}>
          <Titlebar className={styles.titlebar}>
            <Breadcrumb
              className={classnames(styles.breadcrumb)}
              items={breadcrumbItems.map((item) => ({
                title: (
                  <span
                    className={styles.breadcrumbItem}
                    onClick={() => navigate(item.path)}
                  >
                    {item.title}
                  </span>
                ),
              }))}
            />
          </Titlebar>
          <div className={styles.editorContainer}>
            <EditProjectView />
          </div>
        </div>
      </div>
    </ProjectContext.Provider>
  );
};

export default ProjectView;
