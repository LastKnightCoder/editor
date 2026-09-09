import type { TodoGroup, TodoGroupStats } from "../../../types";

type TodoGroupTabsProps = {
  groups: TodoGroup[];
  activeGroupId: number | null;
  groupStats: Record<number, TodoGroupStats>;
  onSelect: (groupId: number) => void;
};

export function TodoGroupTabs({ groups, activeGroupId, groupStats, onSelect }: TodoGroupTabsProps) {
  return (
    <div className="scrollbar-hide overflow-x-auto">
      <div className="inline-flex min-w-full border-b border-gray-100 px-4 dark:border-neutral-800">
        {groups.map(group => {
          const isActive = activeGroupId === group.id;
          const stats = groupStats[group.id];
          const count = stats ? (stats.uncompleted > 0 ? stats.uncompleted : stats.total) : 0;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onSelect(group.id)}
              className={`relative mr-5 flex shrink-0 items-center gap-1.5 pb-3 pt-3 text-sm transition-colors last:mr-0 ${
                isActive ? "text-[var(--color-primary)]" : "text-gray-500 dark:text-neutral-400"
              }`}
            >
              <span className="whitespace-nowrap font-medium">{group.title}</span>
              {count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${
                    isActive
                      ? "bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
                      : "bg-gray-100 text-gray-400 dark:bg-neutral-800 dark:text-neutral-500"
                  }`}
                >
                  {count}
                </span>
              )}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[var(--color-primary)]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default TodoGroupTabs;
