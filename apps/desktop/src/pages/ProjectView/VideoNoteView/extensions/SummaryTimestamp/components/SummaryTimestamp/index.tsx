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
      className={`
        inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium transition-colors whitespace-nowrap
        ${isDark
          ? "bg-blue-900/40 text-blue-300 hover:bg-blue-800/50"
          : "bg-blue-100 text-blue-700 hover:bg-blue-200"
        }
      `}
      contentEditable={false}
    >
      {formatTimestampMs(start)} - {formatTimestampMs(end)}
      {children}
    </span>
  );
};

export default SummaryTimestamp;
