import React, { useRef } from "react";
import { List, Typography, Empty } from "antd";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PdfHighlight } from "@/types";

const { Text } = Typography;

interface HighlightsListProps {
  highlights: PdfHighlight[];
  onHighlightClick: (highlight: PdfHighlight) => void;
}

const HighlightsList: React.FC<HighlightsListProps> = ({
  highlights,
  onHighlightClick,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: highlights.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // 预估每个高亮项高度
    overscan: 3,
  });

  if (highlights.length === 0) {
    return (
      <div className="h-full flex justify-center items-center">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无标注" />
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto py-2 px-4">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const highlight = highlights[virtualItem.index];

          return (
            <div
              key={virtualItem.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <div
                className="flex items-center gap-3 p-3 cursor-pointer transition-colors duration-200 hover:bg-gray-50 rounded-lg border-b border-gray-100"
                onClick={() => onHighlightClick(highlight)}
              >
                <div className="flex-1 overflow-hidden">
                  <div className="text-sm leading-6 mb-1 text-gray-800 line-clamp-2">
                    {highlight.content || "区域标注"}
                  </div>
                  <Text className="text-xs text-gray-500">
                    第 {highlight.pageNum} 页
                  </Text>
                </div>
                <div
                  className="w-1 h-10 rounded flex-shrink-0"
                  style={{ backgroundColor: highlight.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HighlightsList;
