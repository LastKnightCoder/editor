import React, { memo, useEffect, useState, useRef } from "react";
import classNames from "classnames";
import { MdDelete } from "react-icons/md";
import { RowData, ColumnDef, CellValue } from "../../types";
import { getContentById } from "@/commands/content";
import { Descendant } from "slate";
import Editor, { EditorRef } from "@/components/Editor";
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
  ({
    row,
    columns,
    coverType,
    coverImageColumnId,
    onClick,
    onDelete,
    readonly,
    theme,
  }) => {
    const [detailContent, setDetailContent] = useState<Descendant[] | null>(
      null,
    );
    const [coverImage, setCoverImage] = useState<string | null>(null);
    const [isHovered, setIsHovered] = useState(false);
    const editorRef = useRef<EditorRef>(null);
    const themeColors = useThemeColors();

    // 获取主列的值
    const primaryColumn = columns.find((col) => col.isPrimary);
    const primaryValue = primaryColumn ? (row[primaryColumn.id] as string) : "";

    // 加载详情内容
    useEffect(() => {
      if (coverType === "detail" && row.detailContentId) {
        getContentById(row.detailContentId as number).then((content) => {
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
          "h-[240px] rounded-lg overflow-hidden cursor-pointer transition-all duration-300 flex flex-col border relative group",
          themeColors.cardBgClass,
          themeColors.cardBorderClass,
        )}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {!readonly && onDelete && isHovered && (
          <div
            className={classNames(
              "absolute top-2 right-2 z-10 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors",
              {
                "bg-red-500 hover:bg-red-600 text-white": theme === "light",
                "bg-red-600 hover:bg-red-700 text-white": theme === "dark",
              },
            )}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <MdDelete className="w-4 h-4" />
          </div>
        )}
        <div
          className={classNames(
            "flex-1 min-h-0 overflow-hidden relative",
            themeColors.inputBgClass,
          )}
        >
          {coverType === "detail" && detailContent && (
            <div className="w-full h-full p-3 overflow-hidden">
              <Editor
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
              className="w-full h-full object-cover"
            />
          )}
        </div>
        <div
          className={classNames(
            "h-[60px] px-4 py-3 border-t flex items-center",
            themeColors.cardBgClass,
            themeColors.cardBorderClass,
          )}
        >
          <span
            className={classNames(
              "text-base font-medium overflow-hidden text-ellipsis whitespace-nowrap w-full",
              themeColors.activeTextClass,
            )}
          >
            {primaryValue || "未命名"}
          </span>
        </div>
      </div>
    );
  },
);

GalleryCard.displayName = "GalleryCard";

export default GalleryCard;
