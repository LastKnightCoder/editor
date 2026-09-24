import { memo, type ReactNode } from "react";
import { Inbox } from "lucide-react";

interface EmptyPlaceholderProps {
  text: string;
  icon?: ReactNode;
}

export const EmptyPlaceholder = memo<EmptyPlaceholderProps>(({ text, icon }) => {
  return (
    <div className="text-ink-3 flex flex-col items-center justify-center px-8 py-16">
      {icon || <Inbox size={36} strokeWidth={1.25} className="mb-3" />}
      <p className="text-tau-meta">{text}</p>
    </div>
  );
});

EmptyPlaceholder.displayName = "EmptyPlaceholder";
