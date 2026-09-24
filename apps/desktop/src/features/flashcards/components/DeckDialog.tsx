/**
 * 卡组新建 / 编辑 Dialog：图标（legacy flashcardDeckIcons 键）· 名称 · 颜色（6 色设计板）· 描述。
 * 删除卡组会连带删除卡片与复习记录，走 ConfirmDialog 并写明张数（卡片删除不确认、可撤销，卡组不可撤销）。
 */

import DeckIcon from "@/components/DeckIcon";
import type { FlashcardDeck } from "@/types";
import { flashcardDeckIconKeys } from "@/utils/flashcard";
import { Button, Dialog, Input, Textarea, cn, toast } from "@tau/ui";
import { Folder } from "lucide-react";
import { useEffect, useState } from "react";
import { TONE_OPTIONS, TONE_SWATCH, deckTone } from "../deckColors";
import type { FlashcardMutations } from "../queries";
import { DeckMark } from "./FlashcardBits";

interface DeckForm {
  name: string;
  description: string;
  coverColor: string;
  emoji: string;
}

export function DeckDialog({
  open,
  deck,
  mutations,
  onClose,
  onCreated,
}: {
  open: boolean;
  /** null = 新建 */
  deck: FlashcardDeck | null;
  mutations: FlashcardMutations;
  onClose(): void;
  onCreated?(deck: FlashcardDeck): void;
}) {
  const [form, setForm] = useState<DeckForm>({
    name: "",
    description: "",
    coverColor: TONE_OPTIONS[0].color,
    emoji: flashcardDeckIconKeys[0],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      deck
        ? {
            name: deck.name,
            description: deck.description ?? "",
            coverColor: deck.coverColor,
            emoji: deck.emoji,
          }
        : {
            name: "",
            description: "",
            coverColor: TONE_OPTIONS[0].color,
            emoji: flashcardDeckIconKeys[0],
          }
    );
  }, [open, deck]);

  const submit = async () => {
    const name = form.name.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const payload = { ...form, name, description: form.description.trim() };
      if (deck) {
        await mutations.updateDeck({ id: deck.id, ...payload });
        toast.success("卡组已更新");
      } else {
        const created = await mutations.createDeck(payload);
        toast.success(`已创建卡组「${name}」`);
        onCreated?.(created);
      }
      onClose();
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const tone = deckTone(form.coverColor);

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onClose()}
      title={deck ? "编辑卡组" : "新建卡组"}
      icon={<Folder />}
      width={440}
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={!form.name.trim()}
            loading={saving}
          >
            {deck ? "保存" : "创建"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-3">
          <DeckMark deck={form} size="lg" />
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-ink-2 text-[12px] font-medium">名称</span>
            <Input
              data-autofocus
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="例如：操作系统"
            />
          </label>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-ink-2 text-[12px] font-medium">图标</span>
          <div className="flex flex-wrap gap-1">
            {flashcardDeckIconKeys.map(key => (
              <button
                key={key}
                type="button"
                aria-label={key}
                aria-pressed={form.emoji === key}
                onClick={() => setForm(f => ({ ...f, emoji: key }))}
                className={cn(
                  "grid size-8 place-items-center rounded-[8px] transition-colors [&_svg]:size-4",
                  form.emoji === key ? "bg-selected text-accent-text" : "text-ink-2 hover:bg-hover"
                )}
              >
                <DeckIcon emoji={key} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-ink-2 flex text-[12px] font-medium">
            颜色<span className="text-ink-3 ml-auto font-normal">只用于区分卡组</span>
          </span>
          <div className="flex gap-2.5">
            {TONE_OPTIONS.map(option => (
              <button
                key={option.tone}
                type="button"
                aria-label={option.label}
                aria-pressed={tone === option.tone}
                onClick={() => setForm(f => ({ ...f, coverColor: option.color }))}
                className={cn(
                  "size-6 rounded-[8px] transition-shadow",
                  TONE_SWATCH[option.tone],
                  tone === option.tone && "ring-ink-2 ring-offset-surface ring-2 ring-offset-2"
                )}
              />
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-ink-2 text-[12px] font-medium">描述（可选）</span>
          <Textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="这个卡组复习什么"
            rows={3}
          />
        </label>
      </div>
    </Dialog>
  );
}
