import { memo } from "react";
import classNames from "classnames";
import { Descendant } from "slate";
import CustomModal from "@/components/CustomModal";
import { Editor } from "@tau/editor/src";
import useThemeColors from "@/hooks/useThemeColors";
import { formatDate, getContentLength } from "@/utils";
import useDynamicExtensionsStore from "@/stores/useDynamicExtensionsStore";

interface ContentPreviewModalProps {
  open: boolean;
  title: string;
  content: Descendant[];
  contentKey?: string | number; // key for forcing Editor refresh
  onClose: () => void;
  meta?: {
    category?: string;
    updateTime?: number;
    createTime?: number;
  };
  icon?: React.ReactNode;
  iconBgColor?: string;
}

export const ContentPreviewModal = memo<ContentPreviewModalProps>(
  ({ open, title, content, contentKey, onClose, meta, icon, iconBgColor }) => {
    const dynamicExtensions = useDynamicExtensionsStore(
      (state) => state.extensions,
    );
    const themeColors = useThemeColors();

    const defaultIcon = (
      <svg
        className="w-5 h-5 text-blue-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
      </svg>
    );

    return (
      <CustomModal
        open={open}
        onCancel={onClose}
        width={800}
        title={title}
        icon={icon || defaultIcon}
        iconBgColor={
          iconBgColor ||
          "bg-blue-50 dark:bg-blue-500/20 border-blue-200 dark:border-blue-500/30"
        }
        closeOnEscape
      >
        <div
          className="flex flex-col"
          style={{ height: "60vh", maxHeight: "60vh" }}
        >
          {/* Metadata */}
          {meta && (
            <div
              className={classNames(
                "flex items-center gap-3 mb-4 pb-3 border-b text-xs",
                themeColors.cardBorderClass,
                themeColors.secondaryTextClass,
              )}
            >
              {meta.category && (
                <span
                  className={classNames(
                    "px-2 py-0.5 rounded-full",
                    themeColors.tagBgClass,
                    themeColors.tagTextClass,
                  )}
                >
                  {meta.category}
                </span>
              )}
              {meta.createTime && (
                <span>创建于 {formatDate(meta.createTime, true)}</span>
              )}
              {meta.updateTime && (
                <span>更新于 {formatDate(meta.updateTime, true)}</span>
              )}
              {content && <span>字数：{getContentLength(content)}</span>}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <Editor
              key={contentKey}
              initValue={content}
              readonly
              extensions={dynamicExtensions}
              className={themeColors.textClass}
              style={{ padding: "0 4px" }}
            />
          </div>
        </div>
      </CustomModal>
    );
  },
);

ContentPreviewModal.displayName = "ContentPreviewModal";
