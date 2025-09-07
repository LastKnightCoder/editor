import { memo, useEffect, useRef, useState } from "react";
import Table, { RowData, ColumnDef, TableData } from "@/components/Table";
import { DataTable, ProjectItem, EProjectItemType } from "@/types";
import {
  getProjectItemById,
  getDataTableById,
  updateDataTable,
  updateProjectItem,
} from "@/commands";
import EditText, { EditTextHandle } from "@/components/EditText";
import { defaultProjectItemEventBus } from "@/utils";
import { useCreation, useMemoizedFn } from "ahooks";
import { produce } from "immer";

const TableProjectItemView = memo((props: { projectItemId: number }) => {
  const { projectItemId } = props;

  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);
  const [table, setTable] = useState<DataTable | null>(null);
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
          getDataTableById(item.refId).then((t) => setTable(t));
        }
      })
      .catch((e) => console.error(e));

    return () => {
      setProjectItem(null);
      setTable(null);
    };
  }, [projectItemId]);

  const onChange = useMemoizedFn((data: TableData) => {
    if (!table) return;
    updateDataTable({
      id: table.id,
      columns: data.columns,
      rows: data.rows,
      columnOrder: data.columnOrder,
    }).then((newTable) => setTable(newTable));
  });

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

  if (!projectItem || !table) return null;

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

      <div className="flex-1 px-4 pb-4">
        <Table
          columns={table.columns as ColumnDef[]}
          data={table.rows as RowData[]}
          columnOrder={table.columnOrder}
          onChange={onChange}
        />
      </div>
    </div>
  );
});

export default TableProjectItemView;
