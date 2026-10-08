import { useMemoizedFn } from "ahooks";
import { v4 as getUuid } from "uuid";
import { toast } from "@tau/ui";
import {
  DOCUMENT_DEFAULT_SIZE,
  ECreateBoardElementType,
  type Board,
  type DocumentElement,
} from "@tau/whiteboard";
import { EntityPicker } from "@/components/EntityPicker";
import type { EntityCandidate, EntityKind } from "@/types";

/** 可放进白板的实体：日记只能选某一条碎碎念，不能整天放入 */
const PICKER_KINDS: EntityKind[] = ["card", "article", "project_item", "diary-moment"];
const GAP = 32;

type Placement = Pick<DocumentElement, "entityRef" | "title">;

/** 检索候选的实体身份直接用于文档卡 */
function toPlacement(candidate: EntityCandidate): Placement | null {
  const title = candidate.title;
  switch (candidate.kind) {
    case "card":
    case "article":
    case "diary-moment":
      return { entityRef: { kind: candidate.kind, id: candidate.id }, title };
    case "project_item":
      return { entityRef: { kind: "project-item", id: candidate.id }, title };
    default:
      return null;
  }
}

/** 选中的文档在视口中央排成一行插入，并选中它们 */
function insertDocuments(board: Board, placements: Placement[]) {
  if (placements.length === 0) return;
  const sizes = placements.map(item => DOCUMENT_DEFAULT_SIZE[item.entityRef.kind]);
  const rowWidth = sizes.reduce((sum, size) => sum + size.width, 0) + GAP * (sizes.length - 1);
  const { minX, minY, width, height } = board.viewPort;
  let x = minX + width / 2 - rowWidth / 2;
  const centerY = minY + height / 2;

  const elements = placements.map((placement, index): DocumentElement => {
    const size = sizes[index];
    const element: DocumentElement = {
      id: getUuid(),
      type: "document",
      ...placement,
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
  const close = useMemoizedFn(() => {
    board.currentCreateType = ECreateBoardElementType.None;
    onClose();
  });

  const handleConfirm = useMemoizedFn((picked: EntityCandidate[]) => {
    const canSubmit = board.captureSubmission();
    const placements = picked.map(toPlacement).filter((item): item is Placement => item !== null);
    if (!canSubmit()) return;
    if (placements.length < picked.length) toast.error("部分内容已不存在，未放入");
    insertDocuments(board, placements);
    close();
  });

  return (
    <div className="contents" onClick={e => e.stopPropagation()}>
      <EntityPicker
        title="放入文档"
        subtitle="卡片、文章、项目文档或日记，可多选"
        open={open}
        onClose={close}
        kinds={PICKER_KINDS}
        confirmLabel="放入"
        onConfirm={handleConfirm}
      />
    </div>
  );
}
