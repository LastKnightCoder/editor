import React, { memo, useEffect, useState, useRef, useMemo } from "react";
import { Trash2 } from "lucide-react";
import { RowData, ColumnDef, CellValue } from "../../types";
import { getContentById } from "@/commands/content";
import { Descendant } from "slate";
import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import { ImageItem } from "../../plugins/ImagePlugin/types";

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
  ({ row, columns, coverType, coverImageColumnId, onClick, onDelete, readonly }) => {
    const [detailContent, setDetailContent] = useState<Descendant[] | null>(null);
    const previewContent = useMemo(() => detailContent?.slice(0, 2), [detailContent]);
    const [coverImage, setCoverImage] = useState<string | null>(null);
    const [isHovered, setIsHovered] = useState(false);
    const editorRef = useRef<EditorRef>(null);

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
        className="bg-surface shadow-card rounded-tau-md ease-tau-out hover:shadow-float group relative flex h-[240px] cursor-pointer flex-col overflow-hidden transition-shadow duration-[160ms]"
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {!readonly && onDelete && isHovered && (
          <div
            className="bg-danger text-ink-inverse absolute right-2 top-2 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-[filter] hover:brightness-110"
            onClick={e => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </div>
        )}
        <div className="bg-page relative min-h-0 flex-1 overflow-hidden">
          {coverType === "detail" && detailContent && (
            <div className="h-full w-full overflow-hidden p-3">
              <Editor
                ref={editorRef}
                readonly
                className="h-full text-sm leading-relaxed"
                initValue={previewContent}
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
        <div className="border-line-2 bg-surface flex h-[60px] items-center border-t px-4 py-3">
          <span className="text-ink-1 text-tau-body-lg w-full overflow-hidden text-ellipsis whitespace-nowrap font-medium">
            {primaryValue || "未命名"}
          </span>
        </div>
      </div>
    );
  }
);

GalleryCard.displayName = "GalleryCard";

export default GalleryCard;
