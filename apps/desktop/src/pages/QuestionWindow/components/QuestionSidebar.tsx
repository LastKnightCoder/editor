import { memo, useCallback } from "react";
import ResizeableAndHideableSidebar from "@/components/ResizableAndHideableSidebar";
import QuestionGroupList from "./QuestionGroupList";
import { useQuestionStore } from "@/stores/useQuestionStore";
import type { QuestionGroup, GroupStats } from "./GroupItem";

interface QuestionSidebarProps {
  onCreateGroup: (title: string, color?: string) => Promise<void>;
  onUpdateGroup: (payload: {
    id: number;
    title?: string;
    color?: string;
  }) => Promise<void>;
  onDeleteGroup: (groupId: number) => Promise<void>;
}

const QuestionSidebar = memo(
  ({ onCreateGroup, onUpdateGroup, onDeleteGroup }: QuestionSidebarProps) => {
    const leftOpen = useQuestionStore((state) => state.leftOpen);
    const leftWidth = useQuestionStore((state) => state.leftWidth);
    const setLeftWidth = useQuestionStore((state) => state.setLeftWidth);
    const groups = useQuestionStore((state) => state.groups);
    const groupStats = useQuestionStore((state) => state.groupStats);
    const activeGroupId = useQuestionStore((state) => state.activeGroupId);
    const setActiveGroup = useQuestionStore((state) => state.setActiveGroup);
    const reorderGroups = useQuestionStore((state) => state.reorderGroups);

    const handleWidthChange = useCallback(
      (nextWidth: number) => {
        setLeftWidth(nextWidth);
      },
      [setLeftWidth],
    );

    return (
      <ResizeableAndHideableSidebar
        width={leftWidth}
        open={leftOpen}
        onWidthChange={handleWidthChange}
        className="h-full overflow-hidden shrink-0"
        minWidth={200}
        maxWidth={300}
      >
        <QuestionGroupList
          groups={groups as QuestionGroup[]}
          groupStats={groupStats as Record<number, GroupStats>}
          activeGroupId={activeGroupId}
          onSetActive={setActiveGroup}
          onCreateGroup={onCreateGroup}
          onUpdateGroup={onUpdateGroup}
          onDeleteGroup={onDeleteGroup}
          onReorderGroups={reorderGroups}
        />
      </ResizeableAndHideableSidebar>
    );
  },
);

QuestionSidebar.displayName = "QuestionSidebar";

export default QuestionSidebar;
