import React, { memo, useEffect, useState, useRef } from "react";
import classNames from "classnames";
import { MdDelete } from "react-icons/md";
import { RowData, ColumnDef, CellValue } from "../../types";
import { getContentById } from "@/commands/content";
import { Descendant } from "slate";
import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import { ImageItem } from "../../plugins/ImagePlugin/types";
import useThemeColors from "@/hooks/useThemeColors";

interface GalleryCardProps {
  row: RowData;
  columns: ColumnDef[];
  coverType: "detail" | "image";
  coverImageColumnId?: string;
  onClick: () => void;
  onDelete?: () => void;
  readonly?: boolean;
  theme: "light" | "dark";
}

const GalleryCard: React.FC<GalleryCardProps> = memo(
  ({ row, columns, coverType, coverImageColumnId, onClick, onDelete, readonly, theme }) => {
    const [detailContent, setDetailContent] = useState<Descendant[] | null>(null);
    const [coverImage, setCoverImage] = useState<string | null>(null);
    const [isHovered, setIsHovered] = useState(false);
    const editorRef = useRef<EditorRef>(null);
    const themeColors = useThemeColors();

    // 获取主列的值
    const primaryColumn = columns.find(col => col.isPrimary);
    const primaryValue = primaryColumn ? (row[primaryColumn.id] as string) : "";

    // 加载详情内容
    useEffect(() => {
      if (coverType === "detail" && row.detailContentId) {
        getContentById(row.detailContentId as number).then(content => {
          if (content?.content) {
            setDetailContent(content.content as Descendant[]);
          }
        });
      }
    }, [coverType, row.detailContentId]);

    // 加载封面图片
    useEffect(() => {
      if (coverType === "image" && coverImageColumnId) {
        const imageData = row[coverImageColumnId] as CellValue;
        if (Array.isArray(imageData) && imageData.length > 0) {
          const firstImage = imageData[0] as ImageItem;
          if (firstImage?.url) {
            setCoverImage(firstImage.url);
          }
        }
      }
    }, [coverType, coverImageColumnId, row]);

    return (
      <div
        className={classNames(
          "group relative flex h-[240px] cursor-pointer flex-col overflow-hidden rounded-lg border transition-all duration-300",
          themeColors.cardBgClass,
          themeColors.cardBorderClass
        )}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {!readonly && onDelete && isHovered && (
          <div
            className={classNames(
              "absolute right-2 top-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-colors",
              {
                "bg-red-500 text-white hover:bg-red-600": theme === "light",
                "bg-red-600 text-white hover:bg-red-700": theme === "dark",
              }
            )}
            onClick={e => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <MdDelete className="h-4 w-4" />
          </div>
        )}
        <div
          className={classNames(
            "relative min-h-0 flex-1 overflow-hidden",
            themeColors.inputBgClass
          )}
        >
          {coverType === "detail" && detailContent && (
            <div className="h-full w-full overflow-hidden p-3">
              <Editor
                previewBlocks={2}
                ref={editorRef}
                readonly
                className="h-full text-sm leading-relaxed"
                initValue={detailContent.slice(0, 2)}
              />
            </div>
          )}
          {coverType === "image" && coverImage && (
            <img
              src={coverImage}
              alt={primaryValue || "封面"}
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div
          className={classNames(
            "flex h-[60px] items-center border-t px-4 py-3",
            themeColors.cardBgClass,
            themeColors.cardBorderClass
          )}
        >
          <span
            className={classNames(
              "w-full overflow-hidden text-ellipsis whitespace-nowrap text-base font-medium",
              themeColors.activeTextClass
            )}
          >
            {primaryValue || "未命名"}
          </span>
        </div>
      </div>
    );
  }
);

GalleryCard.displayName = "GalleryCard";

export default GalleryCard;
