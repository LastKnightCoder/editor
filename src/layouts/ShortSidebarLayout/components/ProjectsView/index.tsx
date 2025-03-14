import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMemoizedFn } from "ahooks";
import { FloatButton, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import For from "@/components/For";
import ProjectCard from "./ProjectCard";
import useProjectsStore from "@/stores/useProjectsStore.ts";
import EditProjectInfoModal from "@/layouts/components/EditProjectInfoModal";

import styles from "./index.module.less";
import { Descendant } from "slate";
import { CreateProject } from "@/types";

const MIN_WIDTH = 320;
const MAX_WIDTH = 400;
const GAP = 20;

const EMPTY_DESC: Descendant[] = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const ProjectsView = () => {
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [itemWidth, setItemWidth] = useState(MIN_WIDTH);
  const [createOpen, setCreateOpen] = useState(false);

  const navigate = useNavigate();

  const { projects, createProject } = useProjectsStore((state) => ({
    projects: state.projects,
    createProject: state.createProject,
  }));

  const handleResize = useMemoizedFn((entries: ResizeObserverEntry[]) => {
    const { width } = entries[0].contentRect;

    const nMin = Math.ceil((width + GAP) / (MAX_WIDTH + GAP));
    const nMax = Math.floor((width + GAP) / (MIN_WIDTH + GAP));

    const n = Math.min(nMin, nMax);

    const itemWidth = (width + GAP) / n - GAP;

    setItemWidth(itemWidth);
  });

  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(handleResize);

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [handleResize]);

  const handleCreateProject = useMemoizedFn(
    async (title: string, desc: Descendant[]) => {
      if (!title) {
        message.error("请输入项目名称");
        return;
      }

      const project: CreateProject = {
        title,
        desc,
        children: [],
        archived: false,
      };

      const createdProject = await createProject(project);
      if (createdProject) {
        useProjectsStore.setState({
          activeProjectId: createdProject.id,
        });
        setCreateOpen(false);
        navigate(`/projects/${createdProject.id}`);
      } else {
        message.error("创建项目失败");
      }
    },
  );

  return (
    <div
      className={styles.container}
      ref={gridContainerRef}
      style={{ gap: GAP }}
    >
      <For
        data={projects}
        renderItem={(project) => (
          <ProjectCard
            key={project.id}
            project={project}
            style={{
              width: itemWidth,
              height: 200,
            }}
          />
        )}
      />
      <FloatButton
        icon={<PlusOutlined />}
        tooltip={"新建项目"}
        onClick={() => {
          setCreateOpen(true);
        }}
      />
      <EditProjectInfoModal
        open={createOpen}
        title={""}
        desc={EMPTY_DESC}
        onOk={handleCreateProject}
        onCancel={() => setCreateOpen(false)}
      />
    </div>
  );
};

export default ProjectsView;
