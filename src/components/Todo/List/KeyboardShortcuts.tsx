import { useEffect } from "react";
import { useTodoStore } from "@/stores/useTodoStore";

const KeyboardShortcuts = () => {
  const { activeGroupId, activeTodoId, createItem, deleteItem } =
    useTodoStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Enter: 新建任务
      if (e.ctrlKey && e.key === "Enter" && activeGroupId) {
        e.preventDefault();
        createItem({
          groupId: activeGroupId,
          title: "新任务",
          parentId: null,
        });
      }

      // Delete: 删除当前选中任务
      if (e.key === "Delete" && activeTodoId) {
        e.preventDefault();
        deleteItem(activeTodoId);
      }

      // Escape: 清除选择
      if (e.key === "Escape") {
        // 可以在这里添加清除选择的逻辑
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeGroupId, activeTodoId, createItem, deleteItem]);

  return null;
};

export default KeyboardShortcuts;
