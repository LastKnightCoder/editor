import { memo, useEffect, useState } from "react";
import { Project, EProjectType } from "@/types";
import { getProjectById, updateProject, getProjectList } from "@/commands";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import { ChevronDown } from "lucide-react";
import { Menu, cn } from "@tau/ui";
import { usePage } from "@/page/PageProvider";
import DatabaseWorkspace from "../shared/DatabaseWorkspace";

const DataTableProjectView = memo((props: { projectId: number }) => {
  const { projectId } = props;
  const { navigator } = usePage();

  const [project, setProject] = useState<Project | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [tableId, setTableId] = useState<number>();
  const [switcherOpen, setSwitcherOpen] = useState(false);

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
    <DatabaseWorkspace
      tableId={tableId}
      titleKey={project.id}
      title={project.title}
      onTitleChange={onTitleChange}
      onTitleCommit={onTitleCommit}
      headerExtra={
        <Menu
          open={switcherOpen}
          onOpenChange={setSwitcherOpen}
          align="end"
          className="w-[240px]"
          trigger={
            <button
              type="button"
              title="切换项目"
              className="text-ink-2 hover:bg-hover hover:text-ink-1 grid size-8 shrink-0 place-items-center rounded-[8px] transition-colors duration-[160ms]"
            >
              <ChevronDown
                className={cn(
                  "ease-tau-out size-4 transition-transform duration-150",
                  switcherOpen && "rotate-180"
                )}
                strokeWidth={1.75}
              />
            </button>
          }
        >
          {allProjects.map(proj => {
            const active = proj.id === project.id;
            return (
              <Menu.Item
                key={proj.id}
                onSelect={() => handleSwitchProject(proj)}
                className={active ? "text-accent-text font-medium" : undefined}
              >
                {proj.title}
              </Menu.Item>
            );
          })}
        </Menu>
      }
    />
  );
});

export default DataTableProjectView;
