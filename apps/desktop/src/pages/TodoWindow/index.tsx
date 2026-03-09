import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import { useTodoStore } from "@/stores/useTodoStore";
import GroupList from "@/components/Todo/Sidebar/GroupList";
import Toolbar from "@/components/Todo/List/Toolbar";
import { TodoTree } from "@/components/Todo/List";
import DetailsPanel from "@/components/Todo/Details/DetailsPanel";
import DndProvider from "@/components/DndProvider";
import KeyboardShortcuts from "@/components/Todo/List/KeyboardShortcuts";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";
import { useEffect, useRef } from "react";
import { subscribeTodoMutationEvent } from "@/mcp/todo/events";
import {
  doesTodoEventAffectGroup,
  doesTodoEventAffectTodo,
} from "@/mcp/todo/mutation";

const TodoWindowPage = () => {
  const {
    ui,
    setLeftWidth,
    reloadAfterDatabaseChange,
    activeGroupId,
    systemGroups,
    loadItems,
    loadItemsByType,
    loadGroupStats,
    loadNotes,
    activeTodoId,
  } = useTodoStore();
  const skipNextGroupLoadRef = useRef(false);

  // 在数据库连接或切换时加载 Todo 数据
  useDatabaseChangeEffect(async () => {
    skipNextGroupLoadRef.current = true;
    try {
      await reloadAfterDatabaseChange();
    } finally {
      skipNextGroupLoadRef.current = false;
    }
  });

  useEffect(() => {
    if (skipNextGroupLoadRef.current || activeGroupId == null) {
      return;
    }
    const activeSystemGroup = systemGroups.find((g) => g.id === activeGroupId);
    if (activeSystemGroup?.systemType) {
      loadItemsByType(activeSystemGroup.systemType);
    } else {
      loadItems(activeGroupId);
    }
  }, [activeGroupId, systemGroups, loadItems, loadItemsByType]);

  useEffect(() => {
    return subscribeTodoMutationEvent((event) => {
      if (event.source === "todo-store") {
        return;
      }

      const activeSystemGroup = systemGroups.find(
        (group) => group.id === activeGroupId,
      );

      if (event.entityType === "group") {
        void reloadAfterDatabaseChange();
        return;
      }

      if (
        doesTodoEventAffectGroup(
          event,
          activeGroupId,
          activeSystemGroup?.systemType,
        ) &&
        activeGroupId != null
      ) {
        if (activeSystemGroup?.systemType) {
          void loadItemsByType(activeSystemGroup.systemType);
        } else {
          void loadItems(activeGroupId);
        }
        void loadGroupStats();
      }

      if (doesTodoEventAffectTodo(event, activeTodoId)) {
        void loadNotes(activeTodoId!);
      }
    });
  }, [
    activeGroupId,
    activeTodoId,
    loadGroupStats,
    loadItems,
    loadItemsByType,
    loadNotes,
    reloadAfterDatabaseChange,
    systemGroups,
  ]);

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
