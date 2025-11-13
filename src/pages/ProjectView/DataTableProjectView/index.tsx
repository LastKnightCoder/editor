import { memo, useEffect, useRef, useState } from "react";
import Database, { RowData, ColumnDef } from "@/components/Database";
import { Project, EProjectType } from "@/types";
import { getProjectById, updateProject } from "@/commands";
import EditText, { EditTextHandle } from "@/components/EditText";
import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import useEditDatabase from "@/hooks/useEditDatabase";

const DataTableProjectView = memo((props: { projectId: number }) => {
  const { projectId } = props;

  const [project, setProject] = useState<Project | null>(null);
  const [tableId, setTableId] = useState<number>();
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
  } = useEditDatabase(tableId);
  const titleRef = useRef<EditTextHandle>(null);

  useEffect(() => {
    if (!projectId) return;

    getProjectById(projectId)
      .then((proj) => {
        if (!proj) return;
        if (proj.projectType !== EProjectType.DataTable) return;
        setProject(proj);
        if (proj.dataTableId) {
          setTableId(proj.dataTableId);
        }
      })
      .catch((e) => console.error(e));

    return () => {
      setProject(null);
      setTableId(undefined);
    };
  }, [projectId]);

  const onTitleChange = useMemoizedFn((title: string) => {
    if (!project) return;
    const newProject = produce(project, (draft) => {
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

  const activeView = views.find((view) => view.id === activeViewId);

  if (!project || !table || !activeView) return null;

  return (
    <div className="w-full mx-auto max-w-[1080px] h-full flex flex-col">
      <div className="px-4 pt-3 pb-1 mb-2">
        <EditText
          key={project.id}
          ref={titleRef}
          defaultValue={project.title}
          onChange={onTitleChange}
          contentEditable={true}
          onPressEnter={onPressEnter}
        />
      </div>

      <div className="flex-1 min-h-0 px-4">
        <Database
          key={`${table.id}-${activeView.id}`}
          columns={table.columns as ColumnDef[]}
          data={table.rows as RowData[]}
          views={views}
          activeViewId={activeView.id}
          viewConfig={activeView.config}
          onActiveViewIdChange={onActiveViewIdChange}
          onViewConfigChange={onViewConfigChange}
          onDataChange={onDataChange}
          onCreateView={onCreateView}
          onDeleteView={onDeleteView}
          onRenameView={onRenameView}
          onUpdateView={onUpdateView}
          onReorderViews={onReorderViews}
        />
      </div>
    </div>
  );
});

export default DataTableProjectView;
