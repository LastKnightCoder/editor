import classNames from "classnames";
import {
  ThumbnailsPane,
  ThumbImg,
  type ThumbMeta,
} from "@embedpdf/plugin-thumbnail/react";
import { useScroll } from "@embedpdf/plugin-scroll/react";
import type useThemeColors from "@/hooks/useThemeColors";

interface PdfEmbedThumbnailsProps {
  themeColors: ReturnType<typeof useThemeColors>;
}

const PdfEmbedThumbnails = ({ themeColors }: PdfEmbedThumbnailsProps) => {
  const { state, provides } = useScroll();

  return (
    <div className="flex flex-col w-full h-full">
      <ThumbnailsPane className="w-full h-full relative overflow-y-auto">
        {(meta: ThumbMeta) => {
          const isActive = state?.currentPage === meta.pageIndex + 1;
          // 计算 75% 宽度下的高度，保持宽高比
          const targetWidth = 0.75; // 75% of sidebar width
          const scale = targetWidth;
          const scaledWidth = meta.width * scale;
          const scaledHeight = meta.height * scale;

          return (
            <div
              key={meta.pageIndex}
              className="absolute flex flex-col items-center w-full px-4 py-3 cursor-pointer"
              style={{
                top: meta.top,
                height: meta.wrapperHeight,
              }}
              onClick={() =>
                provides?.scrollToPage({ pageNumber: meta.pageIndex + 1 })
              }
            >
              {/* 图片容器 - 75% 宽度，完整高度 */}
              <div
                className={classNames(
                  "relative bg-white dark:bg-gray-800 rounded-lg overflow-hidden transition-all duration-200 shrink-0",
                  "shadow-sm",
                  isActive
                    ? themeColors.focusBorderClass.replace(
                        "border-",
                        "ring-2 ring-",
                      )
                    : classNames(
                        "ring-1",
                        themeColors.borderClass.replace("border-", "ring-"),
                        themeColors.hoverBorderClass.replace(
                          "hover:border-",
                          "hover:ring-",
                        ),
                      ),
                )}
                style={{
                  width: `${scaledWidth}px`,
                  height: `${scaledHeight}px`,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    padding: meta.padding || 0,
                  }}
                >
                  <ThumbImg meta={meta} />
                </div>
              </div>

              {/* 页码 */}
              <div
                className={classNames(
                  "mt-2 text-xs font-sans transition-colors duration-200 shrink-0",
                  isActive
                    ? classNames(themeColors.activeTextClass, "font-medium")
                    : themeColors.secondaryTextClass,
                )}
                style={{ height: meta.labelHeight }}
              >
                {meta.pageIndex + 1}
              </div>
            </div>
          );
        }}
      </ThumbnailsPane>
    </div>
  );
};

export default PdfEmbedThumbnails;
