import React, { memo } from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import { Editor } from "@tau/editor/src";
import { Descendant } from "slate";

interface PreviewPanelProps {
  title?: string;
  content?: Descendant[];
  emptyText?: string;
  meta?: React.ReactNode;
}

export const PreviewPanel = memo<PreviewPanelProps>(
  ({ title, content, emptyText = "选择项目查看预览", meta }) => {
    const themeColors = useThemeColors();

    if (!content || content.length === 0) {
      return (
        <div
          className={classNames(
            "flex flex-col items-center justify-center h-full rounded-xl border border-dashed p-6",
            themeColors.cardBorderClass,
            themeColors.cardBgClass,
          )}
        >
          <svg
            className={classNames(
              "w-12 h-12 mb-3",
              themeColors.secondaryTextClass,
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          <p className={classNames("text-sm", themeColors.secondaryTextClass)}>
            {emptyText}
          </p>
        </div>
      );
    }

    return (
      <div
        className={classNames(
          "flex flex-col h-full rounded-xl border overflow-hidden",
          themeColors.cardBgClass,
          themeColors.cardBorderClass,
        )}
      >
        {/* 标题区域 */}
        {title && (
          <div
            className={classNames(
              "px-4 py-3 border-b",
              themeColors.cardBorderClass,
            )}
          >
            <h4
              className={classNames(
                "text-sm font-semibold truncate",
                themeColors.activeTextClass,
              )}
            >
              {title}
            </h4>
            {meta && (
              <div
                className={classNames(
                  "text-xs mt-1",
                  themeColors.secondaryTextClass,
                )}
              >
                {meta}
              </div>
            )}
          </div>
        )}

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-4">
          <Editor
            initValue={content}
            readonly
            disableStartExtensions
            className={classNames("text-sm", themeColors.textClass)}
            style={{ minHeight: 200 }}
          />
        </div>
      </div>
    );
  },
);

PreviewPanel.displayName = "PreviewPanel";
