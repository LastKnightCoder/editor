import React, { memo, useEffect, useState, useRef, useMemo } from "react";
import { Trash2 } from "lucide-react";
import { RowData, ColumnDef, CellValue } from "../../types";
import { getContentById } from "@/commands/content";
import { Descendant } from "slate";
import { EditorRef } from "@tau/editor/src";
import Editor from "@/components/ContentEditor";
import { ImageItem } from "../../plugins/ImagePlugin/types";
import { coverGradientOfKey } from "@/utils/cover";

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
        className="bg-surface border-line-1 rounded-tau-md ease-tau-out hover:shadow-card group relative flex h-[240px] cursor-pointer flex-col overflow-hidden border transition-shadow duration-[160ms]"
        onClick={onClick}
      >
        {/* hover 浮出的删除钮：毛玻璃白底保证在任意封面上可读，中性色出现、
            hover 图标才转 danger（破坏性语义留给确认弹窗） */}
        {!readonly && onDelete && (
          <button
            type="button"
            title="删除卡片"
            className="bg-surface/85 text-ink-2 ease-tau-out hover:text-danger absolute right-2 top-2 z-10 grid size-[26px] cursor-pointer place-items-center rounded-full opacity-0 shadow-sm backdrop-blur-sm transition-[opacity,color] duration-[160ms] group-hover:opacity-100"
            onClick={e => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="size-[14px]" strokeWidth={1.75} />
          </button>
        )}
        <div className="relative min-h-0 flex-1 overflow-hidden">
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
          {/* 封面空态兜底：无详情内容 / 图片列未设置图片时按行 id 派生粉彩渐变（同文章卡） */}
          {((coverType === "detail" && !detailContent) ||
            (coverType === "image" && !coverImage)) && (
            <div
              className="absolute inset-0"
              style={{ backgroundImage: coverGradientOfKey(row.id) }}
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
