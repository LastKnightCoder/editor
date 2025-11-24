import { memo } from "react";
import type { RenderElementProps } from "slate-react";
import type { WeReadMetadataElement } from "../../types/elements";
import useTheme from "@/hooks/useTheme";

export const MetadataCard: React.FC<RenderElementProps> = memo((props) => {
  const { attributes, children, element } = props;
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const metaElement = element as any as WeReadMetadataElement;
  const { metaData } = metaElement;

  const borderColor = isDark ? "#2a2a2a" : "#e8e8e8";
  const bgColor = isDark ? "#1a1a1a" : "#fafafa";
  const labelColor = isDark ? "#888888" : "#666666";
  const valueColor = isDark ? "#e0e0e0" : "#262626";

  const formatReadingTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
  };

  return (
    <div {...attributes} contentEditable={false} className="mb-6">
      <div
        className="rounded-lg p-6"
        style={{
          border: `1px solid ${borderColor}`,
          backgroundColor: bgColor,
        }}
      >
        {/* 标题和作者 */}
        <div className="mb-4">
          <h2 className="text-2xl font-bold mb-2" style={{ color: valueColor }}>
            {metaData.title}
          </h2>
          <div className="text-base" style={{ color: labelColor }}>
            作者：
            <span style={{ color: valueColor }} className="ml-2">
              {metaData.author}
            </span>
          </div>
        </div>

        {/* 元信息网格 */}
        <div className="grid grid-cols-2 gap-4">
          {metaData.category && (
            <div>
              <span style={{ color: labelColor }}>分类：</span>
              <span style={{ color: valueColor }} className="ml-2">
                {metaData.category}
              </span>
            </div>
          )}

          {metaData.publisher && (
            <div>
              <span style={{ color: labelColor }}>出版社：</span>
              <span style={{ color: valueColor }} className="ml-2">
                {metaData.publisher}
              </span>
            </div>
          )}

          {metaData.isbn && (
            <div>
              <span style={{ color: labelColor }}>ISBN：</span>
              <span style={{ color: valueColor }} className="ml-2">
                {metaData.isbn}
              </span>
            </div>
          )}

          {metaData.rating && (
            <div>
              <span style={{ color: labelColor }}>评分：</span>
              <span style={{ color: valueColor }} className="ml-2">
                {metaData.rating}
              </span>
            </div>
          )}

          {metaData.totalWords && (
            <div>
              <span style={{ color: labelColor }}>总字数：</span>
              <span style={{ color: valueColor }} className="ml-2">
                {metaData.totalWords.toLocaleString()}
              </span>
            </div>
          )}

          {metaData.readInfo && (
            <>
              <div>
                <span style={{ color: labelColor }}>阅读进度：</span>
                <span style={{ color: valueColor }} className="ml-2">
                  {metaData.readInfo.readingProgress}%
                </span>
              </div>

              <div>
                <span style={{ color: labelColor }}>阅读时长：</span>
                <span style={{ color: valueColor }} className="ml-2">
                  {formatReadingTime(metaData.readInfo.readingTime)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* 简介 */}
        {metaData.intro && (
          <div
            className="mt-4 pt-4"
            style={{ borderTop: `1px solid ${borderColor}` }}
          >
            <div style={{ color: labelColor }} className="mb-2">
              简介：
            </div>
            <div
              style={{ color: valueColor, lineHeight: "1.6" }}
              className="text-sm whitespace-pre-wrap"
            >
              {metaData.intro}
            </div>
          </div>
        )}
      </div>
      {children}
    </div>
  );
});

MetadataCard.displayName = "MetadataCard";
