import React, { memo, useEffect, useState, useRef } from "react";
import classNames from "classnames";
import { RowData, ColumnDef, CellValue } from "../../types";
import { getContentById } from "@/commands/content";
import { Descendant } from "slate";
import Editor, { EditorRef } from "@/components/Editor";
import { ImageItem } from "../../plugins/ImagePlugin/types";

interface GalleryCardProps {
  row: RowData;
  columns: ColumnDef[];
  coverType: "detail" | "image";
  coverImageColumnId?: string;
  onClick: () => void;
  theme: "light" | "dark";
}

const GalleryCard: React.FC<GalleryCardProps> = memo(
  ({ row, columns, coverType, coverImageColumnId, onClick, theme }) => {
    const [detailContent, setDetailContent] = useState<Descendant[] | null>(
      null,
    );
    const [coverImage, setCoverImage] = useState<string | null>(null);
    const editorRef = useRef<EditorRef>(null);

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
          "h-[240px] rounded-lg overflow-hidden cursor-pointer transition-all duration-300 flex flex-col border",
          {
            "bg-white border-gray-200": theme === "light",
            "bg-[#1f1f1f] border-[#3a3a3a]": theme === "dark",
          },
        )}
        onClick={onClick}
      >
        <div
          className={classNames("flex-1 min-h-0 overflow-hidden relative", {
            "bg-gray-100": theme === "light",
            "bg-[#2a2a2a]": theme === "dark",
          })}
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
            {
              "bg-white border-gray-200": theme === "light",
              "bg-[#1f1f1f] border-[#3a3a3a]": theme === "dark",
            },
          )}
        >
          <span
            className={classNames(
              "text-base font-medium overflow-hidden text-ellipsis whitespace-nowrap w-full",
              {
                "text-[#2c2c2c]": theme === "light",
                "text-white": theme === "dark",
              },
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
