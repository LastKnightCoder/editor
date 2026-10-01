/**
 * 闪卡编辑 Dialog（双栏：左题面 · 右属性）。
 * 左：题型分段 → 题干（填空题可在题干里挖空）→ 补充说明（题面下方显示）→ 按题型变化的答案区 →
 *     提示（复习时点开才显示）→ 解析（翻面后显示）→ 参考资料；
 * 右：卡组 · 难度 · 标签 · 复习信息（编辑时）。
 * 新建可「保存并新建」连续录入（卡组与题型沿用上一张）；⌘↵ 保存、⌘⇧↵ 保存并新建。
 * 富文本编辑与参考资料编辑复用 components/FlashcardEditor 的子组件（与 AI 生成弹窗共用）。
 */

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
import { MOD } from "../overlay";
import type { FlashcardMutations } from "../queries";

import { emptyForm, formFromCard, validate, type FormState } from "../editorModel";
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
}) {
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
          ? { ...emptyForm(deckId, "qa"), references: initialReferences ?? [] }
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
      toast.warning(error);
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
      references: form.references.filter(ref => ref.title?.trim()),
    };
    setSaving(true);
    try {
      if (card) {
        await mutations.updateCard({ ...payload, id: card.id, deckId: form.deckId });
        toast.success("已保存修改");
        onClose();
      } else {
        await mutations.createCard({ ...payload, deckId: form.deckId });
        if (continueNext) {
          toast.success("已保存，继续新建下一张");
          setForm({ ...emptyForm(form.deckId, form.type), references: initialReferences ?? [] });
          setRevision(r => r + 1);
        } else {
          toast.success("已新建闪卡");
          onClose();
        }
      }
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const deck = form ? decks.find(d => d.id === form.deckId) : undefined;

  return (
    <Dialog
      open={open && form !== null}
      onOpenChange={next => !next && onClose()}
      title={card ? "编辑闪卡" : "新建闪卡"}
      icon={<CreditCard />}
      subtitle={
        card ? `${deck?.name ?? ""} · 修改内容不影响复习进度` : `${MOD}↵ 保存 · ${MOD}⇧↵ 保存并新建`
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
                <IconButton aria-label="更多操作" title="更多操作" className="mr-auto">
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
                      card.status === "suspended" ? "已恢复复习" : "已暂停，不再进入复习"
                    );
                    onClose();
                  } catch {
                    toast.error("更新复习状态失败");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {card.status === "suspended" ? "恢复复习" : "暂停复习"}
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
                删除闪卡
              </Menu.Item>
            </Menu>
          )}
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            取消
          </Button>
          {!card && (
            <Button variant="soft" onClick={() => void save(true)} disabled={saving}>
              保存并新建
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => void save(false)}
            loading={saving}
            loadingText="保存中…"
          >
            保存
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
