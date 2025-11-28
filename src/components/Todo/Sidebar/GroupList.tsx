import { useMemo } from "react";
import { useTodoStore } from "@/stores/useTodoStore";
import { useMemoizedFn } from "ahooks";
import { type ProjectColorName } from "@/constants/project-colors";
import { SidebarHeader, GroupItem } from "./components";
import useThemeColors from "@/hooks/useThemeColors";
import classNames from "classnames";

const GroupList = () => {
  const {
    groups,
    systemGroups,
    groupStats,
    activeGroupId,
    setActiveGroup,
    createGroup,
    loadGroupStats,
    reorderGroups,
    loadItemsByType,
  } = useTodoStore();
  const themeColors = useThemeColors();

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
    <div
      className={classNames(
        "h-full flex flex-col border-r transition-colors",
        themeColors.borderClass,
      )}
    >
      <SidebarHeader onCreate={onCreate} />
      <div className="flex-1 overflow-auto">
        {/* 系统组 */}
        {systemGroups.length > 0 && (
          <>
            <div
              className={classNames(
                "px-3 py-2 text-xs font-medium transition-colors",
                themeColors.textClass,
              )}
            >
              系统
            </div>
            {systemGroups.map((g) => (
              <GroupItem
                key={g.id}
                id={g.id}
                title={g.title}
                color={g.color as ProjectColorName | undefined}
                active={activeGroupId === g.id}
                onClick={() => {
                  setActiveGroup(g.id);
                  // 为系统组加载对应类型的任务
                  if (g.systemType) {
                    loadItemsByType(g.systemType);
                  }
                }}
                onMove={onMove}
                stats={groupStats[g.id]}
                isSystem={true}
              />
            ))}
            <div
              className={classNames(
                "mx-3 my-2 border-t transition-colors",
                themeColors.borderClass,
              )}
            />
          </>
        )}

        {/* 用户项目 */}
        {groups.length > 0 && (
          <>
            <div
              className={classNames(
                "px-3 py-2 text-xs font-medium transition-colors",
                themeColors.textClass,
              )}
            >
              项目
            </div>
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
          </>
        )}
      </div>
    </div>
  );
};

export default GroupList;
