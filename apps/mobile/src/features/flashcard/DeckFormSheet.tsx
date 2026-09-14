// 卡组新建/编辑表单（BottomSheet）：名称、描述、emoji、调色板。

import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { toast } from "../../components/toast";
import * as tauri from "../../services/tauri";
import { DECK_COLORS, DECK_EMOJIS } from "./constants";
import type { FlashcardDeck } from "./types";
import { invalidateFlashcardQueries } from "./queries";

const inputClass =
  "w-full rounded-[14px] bg-input px-3.5 py-3 text-[14px] font-semibold text-ink placeholder:text-ink-3 placeholder:font-medium outline-none focus:bg-surface";

type DeckFormSheetProps = {
  open: boolean;
  /** 传入 deck 为编辑态，null 为新建态 */
  deck: FlashcardDeck | null;
  onClose: () => void;
  onError: (error: unknown, fallback: string) => void;
};

export function DeckFormSheet({ open, deck, onClose, onError }: DeckFormSheetProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState(DECK_EMOJIS[0]);
  const [color, setColor] = useState(DECK_COLORS[0]);
  const [saving, setSaving] = useState(false);

  // 仅在面板打开的上升沿初始化一次：deck 来自 react-query 缓存，
  // 编辑中途任何 refetch 产生的新引用都不得重置用户正在输入的草稿
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setName(deck?.name ?? "");
      setDescription(deck?.description ?? "");
      setEmoji(deck?.emoji || DECK_EMOJIS[0]);
      setColor(deck?.coverColor || DECK_COLORS[0]);
    }
    wasOpenRef.current = open;
  }, [open, deck]);

  const submit = async () => {
    if (!name.trim()) {
      toast({ type: "warning", text: "请填写卡组名称" });
      return;
    }
    setSaving(true);
    try {
      if (deck) {
        await tauri.flashcardUpdateDeck(deck.id, {
          name: name.trim(),
          description: description.trim(),
          coverColor: color,
          emoji,
        });
      } else {
        await tauri.flashcardCreateDeck({
          name: name.trim(),
          description: description.trim(),
          coverColor: color,
          emoji,
        });
      }
      invalidateFlashcardQueries();
      onClose();
    } catch (error) {
      onError(error, deck ? "保存卡组失败" : "新建卡组失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} title={deck ? "编辑卡组" : "新建卡组"} onClose={onClose}>
      <div className="flex flex-col gap-4 px-5 pb-7">
        <div>
          <div className="text-meta-ink mb-2 text-[12.5px] font-extrabold">名称</div>
          <input
            className={inputClass}
            value={name}
            maxLength={30}
            placeholder="如：算法面试"
            onChange={event => setName(event.target.value)}
          />
        </div>
        <div>
          <div className="text-meta-ink mb-2 text-[12.5px] font-extrabold">描述（选填）</div>
          <input
            className={inputClass}
            value={description}
            maxLength={60}
            placeholder="这个卡组用来记什么"
            onChange={event => setDescription(event.target.value)}
          />
        </div>
        <div>
          <div className="text-meta-ink mb-2 text-[12.5px] font-extrabold">图标</div>
          <div className="grid grid-cols-6 gap-2">
            {DECK_EMOJIS.map(item => (
              <button
                key={item}
                type="button"
                onClick={() => setEmoji(item)}
                className={`grid h-11 place-items-center rounded-[14px] text-[20px] transition-colors ${
                  emoji === item ? "bg-brand-soft ring-accent ring-2" : "bg-input active:bg-press"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-meta-ink mb-2 text-[12.5px] font-extrabold">颜色</div>
          <div className="flex flex-wrap gap-2.5">
            {DECK_COLORS.map(item => (
              <button
                key={item}
                type="button"
                aria-label={`颜色 ${item}`}
                onClick={() => setColor(item)}
                className="h-9 w-9 rounded-full transition-transform active:scale-90"
                style={{
                  background: item,
                  boxShadow:
                    color === item ? "0 0 0 2.5px var(--bg-surface), 0 0 0 5px " + item : undefined,
                }}
              />
            ))}
          </div>
        </div>
        <div
          className="bg-surface shadow-card flex items-center gap-3 rounded-[18px] p-3.5"
          style={{ borderLeft: `4px solid ${color}` }}
        >
          <span className="text-[20px]">{emoji}</span>
          <span className="text-ink text-[14px] font-extrabold">{name.trim() || "卡组预览"}</span>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit()}
          className="shadow-accent rounded-[17px] py-[15px] text-[15px] font-extrabold text-white disabled:opacity-60"
          style={{ background: "var(--brand-grad)" }}
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </BottomSheet>
  );
}
