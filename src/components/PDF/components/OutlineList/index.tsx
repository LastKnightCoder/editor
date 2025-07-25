import React, { useMemo, useRef } from "react";
import { Typography, Empty } from "antd";
import { useVirtualizer } from "@tanstack/react-virtual";
import classNames from "classnames";

const { Text } = Typography;

interface OutlineItem {
  title: string;
  dest: any;
  pageNum?: number;
  children?: OutlineItem[];
}

interface FlatOutlineItem {
  title: string;
  pageNum?: number;
  level: number;
  originalItem: OutlineItem;
}

interface OutlineListProps {
  outline: OutlineItem[];
  onPageChange: (pageNum: number) => void;
}

const OutlineList: React.FC<OutlineListProps> = ({ outline, onPageChange }) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // 将嵌套的目录结构扁平化
  const flatOutline = useMemo(() => {
    const flattenOutline = (
      items: OutlineItem[],
      level = 0,
    ): FlatOutlineItem[] => {
      const result: FlatOutlineItem[] = [];
      for (const item of items) {
        result.push({
          title: item.title,
          pageNum: item.pageNum,
          level,
          originalItem: item,
        });
        if (item.children && item.children.length > 0) {
          result.push(...flattenOutline(item.children, level + 1));
        }
      }
      return result;
    };
    return flattenOutline(outline);
  }, [outline]);

  const virtualizer = useVirtualizer({
    count: flatOutline.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40, // 预估每个目录项高度
    overscan: 5,
  });

  if (outline.length === 0) {
    return (
      <div className="h-full flex justify-center items-center">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="此PDF文档没有目录"
        />
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto py-2 px-1">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = flatOutline[virtualItem.index];
          const hasPageNum = item.pageNum !== undefined;

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
                className={classNames(
                  "flex justify-between items-center py-2 px-3 transition-colors duration-200 rounded mx-1",
                  hasPageNum
                    ? "cursor-pointer hover:bg-gray-100"
                    : "cursor-default",
                )}
                style={{
                  paddingLeft: `${12 + item.level * 16}px`,
                  cursor: hasPageNum ? "pointer" : "default",
                }}
                onClick={() => item.pageNum && onPageChange(item.pageNum)}
              >
                <Text
                  ellipsis={{ tooltip: item.title }}
                  className={classNames(
                    "text-sm flex-1",
                    hasPageNum ? "text-gray-800" : "text-gray-600",
                  )}
                >
                  {item.title}
                </Text>
                {item.pageNum && (
                  <Text className="text-gray-500 text-xs ml-2 flex-shrink-0">
                    {item.pageNum}
                  </Text>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OutlineList;
