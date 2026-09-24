import type { Flashcard, FlashcardDeck } from "@/types";
import { IconButton, Menu } from "@tau/ui";
import { MoreHorizontal, Pause, Pencil, SkipForward, Undo2 } from "lucide-react";
import { MOD } from "../../overlay";
import { DeckMark, StatusDot, TypeChip } from "../FlashcardBits";

export function CardMeta({
  card,
  deck,
  canUndo,
  busy,
  onEdit,
  onSuspend,
  onUndo,
  onSkip,
}: {
  card: Flashcard;
  deck: FlashcardDeck | undefined;
  canUndo: boolean;
  busy: boolean;
  onEdit(): void;
  onSuspend(): void;
  onUndo(): void;
  onSkip(): void;
}) {
  return (
    <div className="text-ink-3 mb-4 flex items-center gap-2.5 text-[12px]">
      {deck && (
        <span className="text-ink-2 inline-flex items-center gap-1.5">
          <DeckMark deck={deck} size="sm" />
          {deck.name}
        </span>
      )}
      <TypeChip type={card.type} />
      <StatusDot status={card.status} />
      <span className="flex-1" />
      <IconButton
        aria-label="编辑 (E)"
        title="编辑 (E)"
        onClick={onEdit}
        className="size-6"
        disabled={busy}
      >
        <Pencil size={13} strokeWidth={1.75} />
      </IconButton>
      <Menu
        align="end"
        trigger={
          <IconButton aria-label="更多" title="更多" className="size-6" disabled={busy}>
            <MoreHorizontal size={14} strokeWidth={1.75} />
          </IconButton>
        }
      >
        <Menu.Item
          icon={<Pause className="size-[15px]" strokeWidth={1.75} />}
          kbd="S"
          onSelect={onSuspend}
        >
          暂停这张卡片
        </Menu.Item>
        <Menu.Item
          icon={<Undo2 className="size-[15px]" strokeWidth={1.75} />}
          kbd={`${MOD}Z`}
          disabled={!canUndo}
          onSelect={onUndo}
        >
          撤销上一张评分
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item
          icon={<SkipForward className="size-[15px]" strokeWidth={1.75} />}
          onSelect={onSkip}
        >
          跳过，放到队尾
        </Menu.Item>
      </Menu>
    </div>
  );
}
