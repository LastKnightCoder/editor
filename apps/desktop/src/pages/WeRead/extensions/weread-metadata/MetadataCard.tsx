import { memo } from "react";
import classNames from "classnames";
import type { RenderElementProps } from "slate-react";
import type { WeReadMetadataElement } from "../../types/elements";

export const MetadataCard: React.FC<RenderElementProps> = memo((props) => {
  const { attributes, children, element } = props;

  const metaElement = element as any as WeReadMetadataElement;
  const { metaData } = metaElement;

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
        className={classNames(
          "rounded-lg p-6 border",
          "bg-[var(--th-card-bg)] border-[var(--th-border)] shadow-sm",
        )}
      >
        {/* 标题和作者 */}
        <div className="mb-4">
          <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-gray-100">
            {metaData.title}
          </h2>
          <div className="text-base text-gray-600 dark:text-gray-400">
            作者：
            <span className="ml-2 text-gray-900 dark:text-gray-100">
              {metaData.author}
            </span>
          </div>
        </div>

        {/* 元信息网格 */}
        <div className="grid grid-cols-2 gap-4">
          {metaData.category && (
            <div>
              <span className="text-gray-600 dark:text-gray-400">分类：</span>
              <span className="ml-2 text-gray-900 dark:text-gray-100">
                {metaData.category}
              </span>
            </div>
          )}

          {metaData.publisher && (
            <div>
              <span className="text-gray-600 dark:text-gray-400">出版社：</span>
              <span className="ml-2 text-gray-900 dark:text-gray-100">
                {metaData.publisher}
              </span>
            </div>
          )}

          {metaData.isbn && (
            <div>
              <span className="text-gray-600 dark:text-gray-400">ISBN：</span>
              <span className="ml-2 text-gray-900 dark:text-gray-100">
                {metaData.isbn}
              </span>
            </div>
          )}

          {metaData.rating && (
            <div>
              <span className="text-gray-600 dark:text-gray-400">评分：</span>
              <span className="ml-2 text-gray-900 dark:text-gray-100">
                {metaData.rating}
              </span>
            </div>
          )}

          {metaData.totalWords && (
            <div>
              <span className="text-gray-600 dark:text-gray-400">总字数：</span>
              <span className="ml-2 text-gray-900 dark:text-gray-100">
                {metaData.totalWords.toLocaleString()}
              </span>
            </div>
          )}

          {metaData.readInfo && (
            <>
              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  阅读进度：
                </span>
                <span className="ml-2 text-gray-900 dark:text-gray-100">
                  {metaData.readInfo.readingProgress}%
                </span>
              </div>

              <div>
                <span className="text-gray-600 dark:text-gray-400">
                  阅读时长：
                </span>
                <span className="ml-2 text-gray-900 dark:text-gray-100">
                  {formatReadingTime(metaData.readInfo.readingTime)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* 简介 */}
        {metaData.intro && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="mb-2 text-gray-600 dark:text-gray-400">简介：</div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed text-gray-900 dark:text-gray-100">
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
