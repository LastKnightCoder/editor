import { memo, type ReactNode } from "react";
import { Inbox } from "lucide-react";

interface EmptyPlaceholderProps {
  text: string;
  icon?: ReactNode;
}

export const EmptyPlaceholder = memo<EmptyPlaceholderProps>(({ text, icon }) => {
  return (
    <div className="border-line-1 text-ink-3 rounded-tau-md flex flex-col items-center justify-center border border-dashed p-8">
      {icon || <Inbox size={40} strokeWidth={1.25} className="mb-3" />}
      <p className="text-tau-meta">{text}</p>
    </div>
  );
});

EmptyPlaceholder.displayName = "EmptyPlaceholder";
