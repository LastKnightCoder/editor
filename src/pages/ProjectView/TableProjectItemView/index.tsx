import { memo, useEffect, useRef, useState } from "react";
import Database, { RowData, ColumnDef } from "@/components/Database";
import { ProjectItem, EProjectItemType } from "@/types";
import { getProjectItemById, updateProjectItem } from "@/commands";
import EditText, { EditTextHandle } from "@/components/EditText";
import { defaultProjectItemEventBus } from "@/utils";
import { useCreation, useMemoizedFn } from "ahooks";
import { produce } from "immer";
import useEditDatabase from "@/hooks/useEditDatabase";

const TableProjectItemView = memo((props: { projectItemId: number }) => {
  const { projectItemId } = props;

  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);
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
    onReorderViews,
    onActiveViewIdChange,
  } = useEditDatabase(tableId);
  const titleRef = useRef<EditTextHandle>(null);
  const projectItemEventBus = useCreation(
    () => defaultProjectItemEventBus.createEditor(),
    [],
  );

  useEffect(() => {
    if (!projectItemId) return;

    getProjectItemById(projectItemId)
      .then((item) => {
        if (!item) return;
        if (item.projectItemType !== EProjectItemType.TableView) return;
        setProjectItem(item);
        if (item.refType === "data-table" && item.refId) {
          setTableId(item.refId);
        }
      })
      .catch((e) => console.error(e));

    return () => {
      setProjectItem(null);
      setTableId(undefined);
    };
  }, [projectItemId]);

  const onTitleChange = useMemoizedFn((title: string) => {
    if (!projectItem) return;
    const newProjectItem = produce(projectItem, (draft) => {
      draft.title = title;
    });
    setProjectItem(newProjectItem);
  });

  const onPressEnter = useMemoizedFn(async () => {
    titleRef.current?.blur();
    if (!projectItem) return;
    const updated = await updateProjectItem({ ...projectItem });
    if (updated) {
      setProjectItem(updated);
      projectItemEventBus.publishProjectItemEvent(
        "project-item:updated",
        updated,
      );
    }
  });

  const activeView = views.find((view) => view.id === activeViewId);

  if (!projectItem || !table || !activeView) return null;

  return (
    <div className="w-full mx-auto max-w-[840px] h-full flex flex-col">
      <div className="px-4 pt-3 pb-1 mb-2">
        <EditText
          key={projectItem.id}
          ref={titleRef}
          defaultValue={projectItem.title}
          onChange={onTitleChange}
          contentEditable={true}
          onPressEnter={onPressEnter}
        />
      </div>

      <div className="flex-1 min-h-0 px-4 pb-4">
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
          onReorderViews={onReorderViews}
        />
      </div>
    </div>
  );
});

export default TableProjectItemView;
