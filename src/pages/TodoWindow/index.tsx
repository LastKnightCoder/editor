import { useEffect } from "react";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import { useTodoStore } from "@/stores/todo";
import GroupList from "@/components/Todo/Sidebar/GroupList";
import Toolbar from "@/components/Todo/List/Toolbar";
import { TodoTree } from "@/components/Todo/List";
import DetailsPanel from "@/components/Todo/Details/DetailsPanel";
import DndProvider from "@/components/DndProvider";
import KeyboardShortcuts from "@/components/Todo/List/KeyboardShortcuts";
import useInitDatabase from "@/hooks/useInitDatabase";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";

const TodoWindowPage = () => {
  const { active } = useInitDatabase();
  const isConnected = useDatabaseConnected();
  const {
    ui,
    setLeftWidth,
    setRightWidth,
    loadGroups,
    loadGroupStats,
    activeGroupId,
    loadItems,
    reset,
  } = useTodoStore();

  useEffect(() => {
    if (isConnected && active) {
      loadGroups().then(loadGroupStats);
    } else {
      reset();
    }
  }, [isConnected, active, loadGroups, loadGroupStats, reset]);

  useEffect(() => {
    if (activeGroupId != null) {
      loadItems(activeGroupId);
    }
  }, [activeGroupId, loadItems]);

  return (
    <DndProvider>
      <KeyboardShortcuts />
      <div className="flex w-full h-full overflow-hidden bg-[var(--main-bg-color)]">
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

        <ResizeableAndHideableSidebar
          width={ui.rightWidth}
          open={ui.rightOpen}
          onWidthChange={(w) => setRightWidth(w || ui.rightWidth)}
          side="left"
          className="h-full overflow-hidden"
          minWidth={200}
          maxWidth={400}
        >
          <DetailsPanel />
        </ResizeableAndHideableSidebar>
      </div>
    </DndProvider>
  );
};

export default TodoWindowPage;
