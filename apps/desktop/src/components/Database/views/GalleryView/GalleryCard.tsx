import React, { memo } from "react";
import { Trash2 } from "lucide-react";
import type { RowData, ColumnDef } from "../../types";
import { BrowserImage, useDatabaseSlots } from "../../DatabaseHostContext";

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
    const { GalleryCover, Image = BrowserImage, coverGradient } = useDatabaseSlots();
    // 获取主列的值
    const primaryColumn = columns.find(col => col.isPrimary);
    const primaryValue = primaryColumn ? (row[primaryColumn.id] as string) : "";

    const images = coverImageColumnId ? row[coverImageColumnId] : null;
    const image = coverType === "image" && Array.isArray(images) ? images[0] : null;

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
          {GalleryCover ? (
            <GalleryCover
              row={row}
              columns={columns}
              coverType={coverType}
              coverImageColumnId={coverImageColumnId}
            />
          ) : image?.url ? (
            <Image
              src={image.url}
              alt={primaryValue || "封面"}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="bg-accent-soft absolute inset-0"
              style={{ backgroundImage: coverGradient?.(row.id) }}
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
