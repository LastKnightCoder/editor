import { useMemoizedFn } from "ahooks";
import { v4 as getUuid } from "uuid";
import {
  DOCUMENT_DEFAULT_SIZE,
  ECreateBoardElementType,
  type Board,
  type DocumentElement,
  type DocumentKind,
} from "@tau/whiteboard";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import type { SearchResult } from "@/types/search";

const DOCUMENT_KINDS: DocumentKind[] = ["card", "article", "project-item"];
const GAP = 32;

/** 选中的文档在视口中央排成一行插入，并选中它们 */
export function insertDocuments(board: Board, results: SearchResult[]) {
  const picked = results.filter((result): result is SearchResult & { type: DocumentKind } =>
    DOCUMENT_KINDS.includes(result.type as DocumentKind)
  );
  if (picked.length === 0) return;
  const sizes = picked.map(result => DOCUMENT_DEFAULT_SIZE[result.type]);
  const rowWidth = sizes.reduce((sum, size) => sum + size.width, 0) + GAP * (sizes.length - 1);
  const { minX, minY, width, height } = board.viewPort;
  let x = minX + width / 2 - rowWidth / 2;
  const centerY = minY + height / 2;

  const elements = picked.map((result, index): DocumentElement => {
    const size = sizes[index];
    const element: DocumentElement = {
      id: getUuid(),
      type: "document",
      entityRef: { kind: result.type, id: result.id },
      title: result.title,
      x,
      y: centerY - size.height / 2,
      ...size,
    };
    x += size.width + GAP;
    return element;
  });

  board.apply([
    ...elements.map((node, index) => ({
      type: "insert_node" as const,
      path: [board.children.length + index],
      node,
    })),
    {
      type: "set_selection",
      properties: board.selection,
      newProperties: { selectArea: null, selectedElements: elements },
    },
  ]);
}

export function DocumentSelectorModal({
  open,
  onClose,
  board,
}: {
  open: boolean;
  onClose(): void;
  board: Board;
}) {
  const handleSelect = useMemoizedFn((selected: SearchResult | SearchResult[]) => {
    insertDocuments(board, Array.isArray(selected) ? selected : [selected]);
    board.currentCreateType = ECreateBoardElementType.None;
    onClose();
  });

  const handleCancel = useMemoizedFn(() => {
    board.currentCreateType = ECreateBoardElementType.None;
    onClose();
  });

  return (
    <div className="contents" onClick={e => e.stopPropagation()}>
      <ContentSelectorModal
        title="放入文档"
        subtitle="卡片、文章或项目文档，可多选"
        open={open}
        onCancel={handleCancel}
        onSelect={handleSelect}
        contentType={DOCUMENT_KINDS}
        multiple
      />
    </div>
  );
}
