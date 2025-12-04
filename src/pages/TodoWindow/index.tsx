import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import { useTodoStore } from "@/stores/useTodoStore";
import GroupList from "@/components/Todo/Sidebar/GroupList";
import Toolbar from "@/components/Todo/List/Toolbar";
import { TodoTree } from "@/components/Todo/List";
import DetailsPanel from "@/components/Todo/Details/DetailsPanel";
import DndProvider from "@/components/DndProvider";
import KeyboardShortcuts from "@/components/Todo/List/KeyboardShortcuts";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import { useEffect } from "react";

const TodoWindowPage = () => {
  const {
    ui,
    setLeftWidth,
    loadGroups,
    loadSystemGroups,
    loadGroupStats,
    activeGroupId,
    loadItems,
    activeTodoId,
  } = useTodoStore();

  // 在数据库连接或切换时加载 Todo 数据
  useDatabaseChangeEffect(() => {
    loadSystemGroups();
    loadGroups().then(loadGroupStats);
  });

  useEffect(() => {
    if (activeGroupId != null) {
      loadItems(activeGroupId);
    }
  }, [activeGroupId, loadItems]);

  return (
    <DndProvider>
      <KeyboardShortcuts />
      <div className="flex w-full h-full overflow-hidden">
        <ResizeableAndHideableSidebar
          width={ui.leftWidth}
          open={ui.leftOpen}
          onWidthChange={(w) => setLeftWidth(w || ui.leftWidth)}
          className="h-full overflow-hidden"
          minWidth={160}
          maxWidth={300}
        >
          <GroupList />
        </ResizeableAndHideableSidebar>

        <div className="flex flex-col flex-1 h-full min-w-0">
          <Toolbar />
          <div className="flex-1 min-h-0 p-2">
            <TodoTree />
          </div>
        </div>
      </div>
      <DetailsPanel key={activeTodoId ?? "todo-details"} />
    </DndProvider>
  );
};

export default TodoWindowPage;
