import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import classNames from "classnames";

interface ThumbnailItem {
  pageNum: number;
  canvas?: HTMLCanvasElement | null;
  dataURL?: string;
}

interface ThumbnailsListProps {
  thumbnails: ThumbnailItem[];
  currentPageNum: number;
  onPageChange: (pageNum: number) => void;
}

const ThumbnailsList: React.FC<ThumbnailsListProps> = ({
  thumbnails,
  currentPageNum,
  onPageChange,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: thumbnails.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // 预估每个缩略图高度 (150px image + 50px padding)
    overscan: 3, // 预渲染3个额外项目
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto p-2">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const thumbnail = thumbnails[virtualItem.index];
          const isActive = thumbnail.pageNum === currentPageNum;

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
              <div className="p-1">
                <div
                  className={classNames(
                    "flex flex-col items-center p-2 border-2 rounded-lg cursor-pointer transition-all duration-200",
                    isActive
                      ? "border-blue-500 bg-blue-50"
                      : "border-transparent hover:bg-gray-100 hover:border-gray-300",
                  )}
                  onClick={() => onPageChange(thumbnail.pageNum)}
                >
                  <div className="w-[120px] h-[150px] flex items-center justify-center rounded overflow-hidden bg-white border border-gray-200">
                    {thumbnail.canvas || thumbnail.dataURL ? (
                      <img
                        src={thumbnail.dataURL || thumbnail.canvas?.toDataURL()}
                        alt={`第 ${thumbnail.pageNum} 页`}
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <div className="text-xs text-gray-400 text-center">
                        加载失败
                      </div>
                    )}
                  </div>
                  <div className="mt-1.5 text-xs text-gray-600 text-center">
                    第 {thumbnail.pageNum} 页
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ThumbnailsList;
