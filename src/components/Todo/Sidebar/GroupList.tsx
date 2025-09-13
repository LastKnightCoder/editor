import { useMemo } from "react";
import { useTodoStore } from "@/stores/todo";
import { useMemoizedFn } from "ahooks";
import { type ProjectColorName } from "@/constants/project-colors";
import { SidebarHeader, GroupItem } from "./components";

const GroupList = () => {
  const {
    groups,
    groupStats,
    activeGroupId,
    setActiveGroup,
    createGroup,
    loadGroupStats,
    reorderGroups,
  } = useTodoStore();

  const computed = useMemo(() => {
    return groups.map((g) => ({
      id: g.id,
      title: g.title,
      color: g.color as ProjectColorName | undefined,
    }));
  }, [groups]);

  let pendingOrder: number[] = [];
  const scheduleReorder = (() => {
    let timer: any = null;
    return (ids: number[]) => {
      pendingOrder = ids;
      if (timer) return;
      timer = setTimeout(async () => {
        const order = pendingOrder;
        pendingOrder = [];
        timer = null;
        await reorderGroups(order);
        await loadGroupStats();
      }, 120);
    };
  })();

  const onMove = useMemoizedFn(
    (dragId: number, hoverId: number, place: "before" | "after") => {
      const arr = [...computed];
      const from = arr.findIndex((x) => x.id === dragId);
      const to = arr.findIndex((x) => x.id === hoverId);
      if (from < 0 || to < 0 || from === to) return;
      const [moved] = arr.splice(from, 1);
      const insertAt = place === "before" ? to : to + 1;
      arr.splice(insertAt > from ? insertAt - 1 : insertAt, 0, moved);
      scheduleReorder(arr.map((x) => x.id));
    },
  );

  const onCreate = useMemoizedFn(
    async (title: string, color?: ProjectColorName) => {
      await createGroup({ title, color });
      await loadGroupStats();
    },
  );

  return (
    <div className="h-full flex flex-col bg-[#FCFAF8] dark:bg-[#292929]">
      <SidebarHeader onCreate={onCreate} />
      <div className="flex-1 overflow-auto">
        {computed.map((g) => (
          <GroupItem
            key={g.id}
            id={g.id}
            title={g.title}
            color={g.color}
            active={activeGroupId === g.id}
            onClick={() => setActiveGroup(g.id)}
            onMove={onMove}
            stats={groupStats[g.id]}
          />
        ))}
      </div>
    </div>
  );
};

export default GroupList;
