import { memo, useEffect, useRef, useState } from "react";
import Database, {
  RowData,
  ColumnDef,
  TableViewConfig,
  DatabaseProps,
} from "@/components/Database";
import { Project, EProjectType } from "@/types";
import { getProjectById, updateProject, getProjectList } from "@/commands";
import EditText, { EditTextHandle } from "@/components/EditText";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import { useEditDatabaseWithContext } from "@tau/shared";
import { ChevronDown } from "lucide-react";
import { usePage } from "@/page/PageProvider";
import { SelectDropDown } from "@tau/shared";

const DataTableProjectView = memo((props: { projectId: number }) => {
  const { projectId } = props;
  const { navigator } = usePage();

  const [project, setProject] = useState<Project | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [tableId, setTableId] = useState<number>();
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  const {
    activeViewId,
    views,
    table,
    onDataChange,
    onViewConfigChange,
    onCreateView,
    onDeleteView,
    onRenameView,
    onUpdateView,
    onReorderViews,
    onActiveViewIdChange,
  } = useEditDatabaseWithContext(tableId) || {};
  const titleRef = useRef<EditTextHandle>(null);

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

  const onPressEnter = useMemoizedFn(async () => {
    titleRef.current?.blur();
    if (!project) return;
    const updated = await updateProject({ ...project });
    if (updated) {
      setProject(updated);
    }
  });

  const activeView = views?.find(view => view.id === activeViewId);

  // Adapter functions to match Database component prop types
  const handleActiveViewIdChange = useMemoizedFn(async (viewId: number | null) => {
    if (onActiveViewIdChange) {
      await Promise.resolve(onActiveViewIdChange(viewId));
    }
  });

  const handleViewConfigChange = useMemoizedFn((config: TableViewConfig) => {
    if (onViewConfigChange) {
      onViewConfigChange(config as any);
    }
  });

  const handleUpdateView = useMemoizedFn(
    async (viewId: number, updates: Parameters<NonNullable<DatabaseProps["onUpdateView"]>>[1]) => {
      if (onUpdateView) {
        return await onUpdateView(viewId, updates);
      }
      return null;
    }
  );

  if (!project || !table || !activeView || !views) return null;

  return (
    <>
      <div className="mx-auto flex h-full w-full max-w-[1080px] flex-col">
        <div className="mb-2 flex items-center gap-2 px-4 pb-1 pt-3">
          <div className="flex-1">
            <EditText
              key={project.id}
              ref={titleRef}
              defaultValue={project.title}
              onChange={onTitleChange}
              contentEditable={true}
              onPressEnter={onPressEnter}
            />
          </div>
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
        </div>

        <div className="min-h-0 flex-1 px-4">
          <Database
            key={`${table.id}-${activeView.id}`}
            columns={table.columns as ColumnDef[]}
            data={table.rows as RowData[]}
            views={views}
            activeViewId={activeView.id}
            viewConfig={activeView.config as TableViewConfig}
            onActiveViewIdChange={handleActiveViewIdChange}
            onViewConfigChange={handleViewConfigChange}
            onDataChange={onDataChange}
            onCreateView={onCreateView}
            onDeleteView={onDeleteView}
            onRenameView={onRenameView}
            onUpdateView={handleUpdateView}
            onReorderViews={onReorderViews}
          />
        </div>
      </div>
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
