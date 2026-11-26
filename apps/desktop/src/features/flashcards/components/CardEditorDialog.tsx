/**
 * 闪卡编辑 Dialog（双栏：左题面 · 右属性）。
 * 左：题型分段 → 题干（填空题可在题干里挖空）→ 补充说明（题面下方显示）→ 按题型变化的答案区 →
 *     提示（复习时点开才显示）→ 解析（翻面后显示）→ 参考资料；
 * 右：卡组 · 难度 · 标签 · 复习信息（编辑时）。
 * 新建可「保存并新建」连续录入（卡组与题型沿用上一张）；⌘↵ 保存、⌘⇧↵ 保存并新建。
 * 富文本编辑与参考资料编辑复用 components/FlashcardEditor 的子组件（与 AI 生成弹窗共用）。
 */

import { flashcardsTranslator, flashcardsErrorText, useFlashcardsI18n } from "../i18n";
import useTheme from "@/hooks/useTheme";
import type {
  Flashcard,
  FlashcardData,
  FlashcardDeck,
  FlashcardType,
  FlashcardReferenceInput,
} from "@/types";
import { createEmptyFlashcardData } from "@/utils/flashcard";
import { Button, Dialog, DialogBody, IconButton, Menu, toast } from "@tau/ui";
import { CreditCard, MoreHorizontal, Pause, Play, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Descendant } from "slate";
import { MOD } from "../overlay";
import type { FlashcardMutations } from "../queries";

import {
  createFormReference,
  emptyForm,
  formFromCard,
  validate,
  type FormState,
} from "../editorModel";
import { CardEditorContent } from "./CardEditorContent";
import { CardEditorProperties } from "./CardEditorProperties";

export function CardEditorDialog({
  open,
  card,
  decks,
  defaultDeckId,
  now,
  mutations,
  onClose,
  onDelete,
  initialReferences,
  initialPrompt,
  onCreated,
}: {
  open: boolean;
  /** null = 新建 */
  card: Flashcard | null;
  decks: FlashcardDeck[];
  defaultDeckId: number | null;
  now: number;
  mutations: FlashcardMutations;
  onClose(): void;
  onDelete(card: Flashcard): void;
  initialReferences?: FlashcardReferenceInput[];
  initialPrompt?: Descendant[];
  onCreated?(card: Flashcard): void;
}) {
  useFlashcardsI18n();
  const { isDark } = useTheme();
  const [form, setForm] = useState<FormState | null>(null);
  // 富文本编辑器的 initValue 只在挂载时生效：换卡 / 连续新建时递增 key 重建
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const deckId = defaultDeckId ?? decks[0]?.id;
    setForm(
      card
        ? formFromCard(card)
        : deckId != null
          ? {
              ...emptyForm(deckId, "qa"),
              ...(initialPrompt?.length ? { prompt: initialPrompt } : {}),
              references: (initialReferences ?? []).map(createFormReference),
            }
          : null
    );
    setRevision(r => r + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在打开 / 换卡时初始化
  }, [open, card?.id]);

  const patch = (next: Partial<FormState>) => setForm(prev => (prev ? { ...prev, ...next } : prev));
  const patchData = (next: Partial<FlashcardData>) =>
    setForm(prev => (prev ? { ...prev, data: { ...prev.data, ...next } } : prev));

  const changeType = (type: FlashcardType) =>
    setForm(prev => {
      if (!prev || prev.type === type) return prev;
      // 换题型重置答案结构，保留提示与解析
      const data = createEmptyFlashcardData(type);
      return {
        ...prev,
        type,
        data: {
          ...data,
          hint: prev.data.hint ?? data.hint,
          explanation: prev.data.explanation ?? data.explanation,
        },
      };
    });

  const save = async (continueNext: boolean) => {
    if (!form || saving) return;
    const error = validate(form);
    if (error) {
      toast.warning(flashcardsErrorText(error));
      return;
    }
    const data =
      form.type === "single-choice" || form.type === "multiple-choice"
        ? { ...form.data, options: (form.data.options ?? []).filter(o => o.label.trim()) }
        : form.data;
    const payload = {
      type: form.type,
      prompt: form.prompt,
      detail: form.detail,
      data,
      difficulty: form.difficulty,
      tags: form.tags,
      references: form.references
        .filter(ref => ref.title?.trim())
        .map(({ formId: _formId, ...reference }) => reference),
    };
    setSaving(true);
    try {
      if (card) {
        await mutations.updateCard({ ...payload, id: card.id, deckId: form.deckId });
        toast.success(flashcardsTranslator.t("ui.changesSaved"));
        onClose();
      } else {
        const created = await mutations.createCard({ ...payload, deckId: form.deckId });
        onCreated?.(created);
        if (continueNext) {
          toast.success(flashcardsTranslator.t("ui.savedReadyForTheNextCard"));
          setForm({
            ...emptyForm(form.deckId, form.type),
            references: (initialReferences ?? []).map(createFormReference),
          });
          setRevision(r => r + 1);
        } else {
          toast.success(flashcardsTranslator.t("ui.flashcardCreated"));
          onClose();
        }
      }
    } catch {
      toast.error(flashcardsTranslator.t("ui.couldNotSave"));
    } finally {
      setSaving(false);
    }
  };

  const deck = form ? decks.find(d => d.id === form.deckId) : undefined;

  return (
    <Dialog
      open={open && form !== null}
      onOpenChange={next => !next && onClose()}
      title={
        card
          ? flashcardsTranslator.t("ui.editFlashcard")
          : flashcardsTranslator.t("ui.newFlashcard")
      }
      icon={<CreditCard />}
      subtitle={
        card
          ? flashcardsTranslator.t("editor.subtitle", { deck: deck?.name ?? "" })
          : flashcardsTranslator.t("editor.shortcuts", { mod: MOD })
      }
      width={880}
      locked={saving}
      onKeyDown={e => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
          e.preventDefault();
          void save(e.shiftKey && !card);
        }
      }}
      footer={
        <>
          {card && (
            <Menu
              trigger={
                <IconButton
                  aria-label={flashcardsTranslator.t("ui.moreActions")}
                  title={flashcardsTranslator.t("ui.moreActions")}
                  className="mr-auto"
                >
                  <MoreHorizontal size={16} strokeWidth={1.75} />
                </IconButton>
              }
            >
              <Menu.Item
                icon={
                  card.status === "suspended" ? (
                    <Play className="size-[15px]" strokeWidth={1.75} />
                  ) : (
                    <Pause className="size-[15px]" strokeWidth={1.75} />
                  )
                }
                onSelect={async () => {
                  setSaving(true);
                  try {
                    await mutations.setSuspended(card, card.status !== "suspended");
                    toast.success(
                      card.status === "suspended"
                        ? flashcardsTranslator.t("ui.reviewResumed")
                        : flashcardsTranslator.t("ui.suspendedAndRemovedFromReview")
                    );
                    onClose();
                  } catch {
                    toast.error(flashcardsTranslator.t("ui.couldNotUpdateReviewStatus"));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {card.status === "suspended"
                  ? flashcardsTranslator.t("ui.resumeReview")
                  : flashcardsTranslator.t("ui.suspendReview")}
              </Menu.Item>
              <Menu.Separator />
              <Menu.Item
                danger
                icon={<Trash2 className="size-[15px]" strokeWidth={1.75} />}
                onSelect={() => {
                  onClose();
                  onDelete(card);
                }}
              >
                {flashcardsTranslator.t("ui.deleteFlashcard")}
              </Menu.Item>
            </Menu>
          )}
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {flashcardsTranslator.t("ui.cancel")}
          </Button>
          {!card && (
            <Button variant="soft" onClick={() => void save(true)} disabled={saving}>
              {flashcardsTranslator.t("ui.saveAndCreateAnother")}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => void save(false)}
            loading={saving}
            loadingText={flashcardsTranslator.t("ui.saving")}
          >
            {flashcardsTranslator.t("ui.save")}
          </Button>
        </>
      }
    >
      <DialogBody>
        {form && (
          <div className="grid grid-cols-[minmax(0,1fr)_236px] gap-[26px]">
            <CardEditorContent
              form={form}
              revision={revision}
              isDark={isDark}
              patch={patch}
              patchData={patchData}
              changeType={changeType}
            />

            <CardEditorProperties
              key={revision}
              form={form}
              card={card}
              decks={decks}
              now={now}
              patch={patch}
            />
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
}
