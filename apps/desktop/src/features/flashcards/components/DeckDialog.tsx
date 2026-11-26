/**
 * 卡组新建 / 编辑 Dialog：图标（@tau/shared/deck-icon 的 key）· 名称 · 颜色（6 色设计板）· 描述。
 * 删除卡组会连带删除卡片与复习记录，走 ConfirmDialog 并写明张数（卡片删除不确认、可撤销，卡组不可撤销）。
 */

import { flashcardsTranslator, useFlashcardsI18n } from "../i18n";
import DeckIcon, { deckIconKeys } from "@tau/shared/deck-icon";
import type { FlashcardDeck } from "@/types";
import { Button, Dialog, DialogBody, Input, Textarea, cn, toast } from "@tau/ui";
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
  useFlashcardsI18n();
  const [form, setForm] = useState<DeckForm>({
    name: "",
    description: "",
    coverColor: TONE_OPTIONS[0].color,
    emoji: deckIconKeys[0],
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
            emoji: deckIconKeys[0],
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
        toast.success(flashcardsTranslator.t("ui.deckUpdated"));
      } else {
        const created = await mutations.createDeck(payload);
        toast.success(flashcardsTranslator.t("deck.created", { name: name }));
        onCreated?.(created);
      }
      onClose();
    } catch {
      toast.error(flashcardsTranslator.t("ui.couldNotSave"));
    } finally {
      setSaving(false);
    }
  };

  const tone = deckTone(form.coverColor);

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onClose()}
      title={deck ? flashcardsTranslator.t("ui.editDeck") : flashcardsTranslator.t("ui.newDeck")}
      icon={<Folder />}
      width={440}
      locked={saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {flashcardsTranslator.t("ui.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={!form.name.trim()}
            loading={saving}
          >
            {deck ? flashcardsTranslator.t("ui.save") : flashcardsTranslator.t("ui.create")}
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-3">
            <DeckMark deck={form} size="lg" />
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-ink-2 text-[12px] font-medium">
                {flashcardsTranslator.t("ui.name")}
              </span>
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
                placeholder={flashcardsTranslator.t("ui.forExampleOperatingSystems")}
              />
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-ink-2 text-[12px] font-medium">
              {flashcardsTranslator.t("ui.icon")}
            </span>
            <div className="flex flex-wrap gap-1">
              {deckIconKeys.map(key => (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  aria-pressed={form.emoji === key}
                  onClick={() => setForm(f => ({ ...f, emoji: key }))}
                  className={cn(
                    "grid size-8 place-items-center rounded-[8px] transition-colors [&_svg]:size-4",
                    form.emoji === key
                      ? "bg-selected text-accent-text"
                      : "text-ink-2 hover:bg-hover"
                  )}
                >
                  <DeckIcon emoji={key} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-ink-2 flex text-[12px] font-medium">
              {flashcardsTranslator.t("ui.color")}
              <span className="text-ink-3 ml-auto font-normal">
                {flashcardsTranslator.t("ui.usedOnlyToDistinguishDecks")}
              </span>
            </span>
            <div className="flex gap-2.5">
              {TONE_OPTIONS.map(option => (
                <button
                  key={option.tone}
                  type="button"
                  aria-label={flashcardsTranslator.t(option.message)}
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
            <span className="text-ink-2 text-[12px] font-medium">
              {flashcardsTranslator.t("ui.descriptionOptional2")}
            </span>
            <Textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder={flashcardsTranslator.t("ui.whatWillYouReviewWithThisDeck")}
              rows={3}
            />
          </label>
        </div>
      </DialogBody>
    </Dialog>
  );
}
