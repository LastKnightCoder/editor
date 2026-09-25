import { memo, useEffect, useRef, useState } from "react";
import { Project, EProjectType } from "@/types";
import { getProjectById, updateProject, getProjectList } from "@/commands";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import { ChevronDown } from "lucide-react";
import { usePage } from "@/page/PageProvider";
import { SelectDropDown } from "@tau/shared";
import DatabaseWorkspace from "../shared/DatabaseWorkspace";

const DataTableProjectView = memo((props: { projectId: number }) => {
  const { projectId } = props;
  const { navigator } = usePage();

  const [project, setProject] = useState<Project | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [tableId, setTableId] = useState<number>();
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getProjectList().then(projects => {
      setAllProjects(projects);
    });
  }, []);

  useEffect(() => {
    if (!projectId) return;

    getProjectById(projectId)
      .then(proj => {
        if (!proj) return;
        if (proj.projectType !== EProjectType.DataTable) return;
        setProject(proj);
        if (proj.dataTableId) {
          setTableId(proj.dataTableId);
        }
      })
      .catch(e => console.error(e));

    return () => {
      setProject(null);
      setTableId(undefined);
    };
  }, [projectId]);

  const handleSwitchProject = useMemoizedFn((proj: Project) => {
    navigator.push("project-detail", { id: proj.id });
  });

  const handleToggleProjectDropdown = useMemoizedFn((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowProjectDropdown(!showProjectDropdown);
  });

  const onTitleChange = useMemoizedFn((title: string) => {
    if (!project) return;
    const newProject = produce(project, draft => {
      draft.title = title;
    });
    setProject(newProject);
  });

  const onTitleCommit = useMemoizedFn(async () => {
    if (!project) return;
    const updated = await updateProject({ ...project });
    if (updated) {
      setProject(updated);
    }
  });

  if (!project) return null;

  return (
    <>
      <DatabaseWorkspace
        tableId={tableId}
        titleKey={project.id}
        title={project.title}
        onTitleChange={onTitleChange}
        onTitleCommit={onTitleCommit}
        headerExtra={
          <div
            ref={triggerRef}
            className="hover:bg-hover flex cursor-pointer items-center gap-1 rounded-md p-2 transition-all"
            onClick={handleToggleProjectDropdown}
          >
            <ChevronDown
              size={16}
              strokeWidth={1.75}
              className={`text-ink-1 transition-transform duration-200 ${
                showProjectDropdown ? "rotate-180" : ""
              }`}
            />
          </div>
        }
      />
      <SelectDropDown
        items={allProjects}
        selectedKey={project.id}
        show={showProjectDropdown}
        onClose={() => setShowProjectDropdown(false)}
        onSelect={handleSwitchProject}
        triggerElement={triggerRef.current}
        getKey={proj => proj.id}
        renderItem={proj => proj.title}
        width={240}
      />
    </>
  );
});

export default DataTableProjectView;
