import React, { PropsWithChildren } from "react";
import { RenderElementProps } from "slate-react";
import useTheme from "@/hooks/useTheme";
import { formatTimestampMs, SummaryTimestampElement } from "../../";

interface SummaryTimestampProps {
  attributes: RenderElementProps["attributes"];
  element: SummaryTimestampElement;
  onSeek: (time: number) => void;
}

const SummaryTimestamp: React.FC<PropsWithChildren<SummaryTimestampProps>> = ({
  attributes,
  element,
  children,
  onSeek,
}) => {
  const { isDark } = useTheme();
  const { start, end } = element;

  return (
    <span
      {...attributes}
      onClick={() => onSeek(start)}
      className={`inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-sm font-medium transition-colors ${
        isDark
          ? "bg-[var(--th-accent)]/30 hover:bg-[var(--th-accent)]/40"
          : "hover:bg-[var(--th-accent)]/15 bg-[var(--th-accent-soft)] text-[var(--th-active-text)]"
      } `}
      contentEditable={false}
    >
      {formatTimestampMs(start)} - {formatTimestampMs(end)}
      {children}
    </span>
  );
};

export default SummaryTimestamp;
