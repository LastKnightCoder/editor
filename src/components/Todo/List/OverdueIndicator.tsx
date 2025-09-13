import { useMemo } from "react";

interface OverdueIndicatorProps {
  dueAt?: number | null;
  isCompleted: boolean;
}

const OverdueIndicator = ({ dueAt, isCompleted }: OverdueIndicatorProps) => {
  const isOverdue = useMemo(() => {
    if (!dueAt || isCompleted) return false;
    return Date.now() > dueAt;
  }, [dueAt, isCompleted]);

  const isToday = useMemo(() => {
    if (!dueAt) return false;
    const today = new Date();
    const due = new Date(dueAt);
    return today.toDateString() === due.toDateString();
  }, [dueAt]);

  if (isOverdue) {
    return <div className="w-2 h-2 bg-red-500 rounded-full" title="已逾期" />;
  }

  if (isToday) {
    return (
      <div className="w-2 h-2 bg-orange-500 rounded-full" title="今日到期" />
    );
  }

  return null;
};

export default OverdueIndicator;
