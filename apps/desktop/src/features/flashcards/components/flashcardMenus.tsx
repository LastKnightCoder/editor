import type { Flashcard, FlashcardDeck } from "@/types";
import { Menu, toast } from "@tau/ui";
import { ArrowRightLeft, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import type { FlashcardMutations } from "../queries";
import { DeckMark } from "./FlashcardBits";

interface DeckMenuActions {
  onEdit(deck: FlashcardDeck): void;
  onAddCard(deckId: number): void;
  onDelete(deck: FlashcardDeck): void;
}

interface CardMenuActions {
  decks: FlashcardDeck[];
  mutations: Pick<FlashcardMutations, "moveToDeck" | "setSuspended">;
  onEdit(card: Flashcard): void;
  onDelete(card: Flashcard): void;
}

const menuIcon = "size-[15px]";

// Menu 需要直接读取子项声明，使用渲染函数保留键盘导航与类型搜索。
export const renderDeckMenu = (
  target: FlashcardDeck,
  { onEdit, onAddCard, onDelete }: DeckMenuActions
) => (
  <>
    <Menu.Item
      icon={<Pencil className={menuIcon} strokeWidth={1.75} />}
      onSelect={() => onEdit(target)}
    >
      编辑卡组
    </Menu.Item>
    <Menu.Item
      icon={<Plus className={menuIcon} strokeWidth={1.75} />}
      onSelect={() => onAddCard(target.id)}
    >
      在此卡组新建闪卡
    </Menu.Item>
    <Menu.Separator />
    <Menu.Item
      danger
      icon={<Trash2 className={menuIcon} strokeWidth={1.75} />}
      onSelect={() => onDelete(target)}
    >
      删除卡组
    </Menu.Item>
  </>
);

export const renderCardMenu = (
  card: Flashcard,
  { decks, mutations, onEdit, onDelete }: CardMenuActions
) => (
  <>
    <Menu.Item
      icon={<Pencil className={menuIcon} strokeWidth={1.75} />}
      kbd="⏎"
      onSelect={() => onEdit(card)}
    >
      编辑
    </Menu.Item>
    <Menu.Item
      icon={
        card.status === "suspended" ? (
          <Play className={menuIcon} strokeWidth={1.75} />
        ) : (
          <Pause className={menuIcon} strokeWidth={1.75} />
        )
      }
      onSelect={() =>
        void mutations
          .setSuspended(card, card.status !== "suspended")
          .catch(() => toast.error("更新复习状态失败"))
      }
    >
      {card.status === "suspended" ? "恢复复习" : "暂停复习"}
    </Menu.Item>
    {decks.length > 1 && (
      <Menu.Submenu
        label="移动到卡组"
        icon={<ArrowRightLeft className={menuIcon} strokeWidth={1.75} />}
      >
        {decks
          .filter(d => d.id !== card.deckId)
          .map(d => (
            <Menu.Item
              key={d.id}
              icon={<DeckMark deck={d} size="xs" />}
              onSelect={async () => {
                const from = card.deckId;
                try {
                  await mutations.moveToDeck(card, d.id);
                  toast.success(`已移到「${d.name}」`, {
                    action: {
                      label: "撤销",
                      onClick: () =>
                        void mutations
                          .moveToDeck({ ...card, deckId: d.id }, from)
                          .catch(() => toast.error("撤销移动失败")),
                    },
                  });
                } catch {
                  toast.error("移动失败");
                }
              }}
            >
              {d.name}
            </Menu.Item>
          ))}
      </Menu.Submenu>
    )}
    <Menu.Separator />
    <Menu.Item
      danger
      icon={<Trash2 className={menuIcon} strokeWidth={1.75} />}
      onSelect={() => onDelete(card)}
    >
      删除
    </Menu.Item>
  </>
);
