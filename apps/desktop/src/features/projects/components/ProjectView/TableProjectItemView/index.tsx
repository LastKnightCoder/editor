import { memo, useEffect, useState } from "react";
import { ProjectItem, EProjectItemType } from "@/types";
import { getProjectItemById, updateProjectItem } from "@/commands";
import { defaultProjectItemEventBus } from "@/utils";
import { useCreation, useMemoizedFn } from "ahooks";
import { produce } from "immer";
import DatabaseWorkspace from "../shared/DatabaseWorkspace";

const TableProjectItemView = memo((props: { projectItemId: number }) => {
  const { projectItemId } = props;

  const [projectItem, setProjectItem] = useState<ProjectItem | null>(null);
  const [tableId, setTableId] = useState<number>();
  const projectItemEventBus = useCreation(() => defaultProjectItemEventBus.createEditor(), []);

  useEffect(() => {
    if (!projectItemId) return;

    getProjectItemById(projectItemId)
      .then(item => {
        if (!item) return;
        if (item.projectItemType !== EProjectItemType.TableView) return;
        setProjectItem(item);
        if (item.refType === "data-table" && item.refId) {
          setTableId(item.refId);
        }
      })
      .catch(e => console.error(e));

    return () => {
      setProjectItem(null);
      setTableId(undefined);
    };
  }, [projectItemId]);

  const onTitleChange = useMemoizedFn((title: string) => {
    if (!projectItem) return;
    const newProjectItem = produce(projectItem, draft => {
      draft.title = title;
    });
    setProjectItem(newProjectItem);
  });

  const onTitleCommit = useMemoizedFn(async () => {
    if (!projectItem) return;
    const updated = await updateProjectItem({ ...projectItem });
    if (updated) {
      setProjectItem(updated);
      // 标题同步回文档树
      projectItemEventBus.publishProjectItemEvent("project-item:updated", updated);
    }
  });

  if (!projectItem) return null;

  return (
    <DatabaseWorkspace
      tableId={tableId}
      titleKey={projectItem.id}
      title={projectItem.title}
      onTitleChange={onTitleChange}
      onTitleCommit={onTitleCommit}
    />
  );
});

export default TableProjectItemView;
