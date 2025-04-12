import ProjectList from "./ProjectList";
import classnames from "classnames";
import { useNavigate } from "react-router-dom";

import EditProjectView from "./EditProjectView";
import styles from "./index.module.less";
import { useParams } from "react-router-dom";
import { Breadcrumb, Empty, Button } from "antd";
import ProjectContext from "./ProjectContext";
import Titlebar from "@/components/Titlebar";
import { useMemo, useState, useEffect } from "react";
import { Project } from "@/types";
import { getProjectById } from "@/commands";
import { LoadingOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import useProjectsStore from "@/stores/useProjectsStore";
import If from "@/components/If";
import { useMemoizedFn } from "ahooks";

const ProjectView = () => {
  const { id } = useParams();

  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const { hideProjectItemList } = useProjectsStore((state) => ({
    hideProjectItemList: state.hideProjectItemList,
  }));

  const openSidebar = useMemoizedFn(() => {
    useProjectsStore.setState({
      hideProjectItemList: false,
    });
  });

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

  const breadcrumbItems = useMemo(() => {
    if (!project) return [];
    return [
      { title: "首页", path: "/" },
      { title: "项目列表", path: "/projects/list" },
      { title: project.title, path: `/projects/detail/${project.id}` },
    ];
  }, [project]);

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
          <Button type="primary" onClick={() => navigate("/projects/list")}>
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
      }}
    >
      <div className={classnames(styles.viewContainer)}>
        <div
          className={classnames(styles.sidebar, {
            [styles.hide]: hideProjectItemList,
          })}
        >
          <ProjectList />
        </div>

        <div className={styles.edit}>
          <Titlebar className={styles.titlebar}>
            <If condition={hideProjectItemList}>
              <div className={styles.openIndicator} onClick={openSidebar}>
                <MenuUnfoldOutlined />
              </div>
            </If>
            <Breadcrumb
              className={classnames(styles.breadcrumb, {
                [styles.showUnfold]: hideProjectItemList,
              })}
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
