import ReferenceEditor from "@/components/FlashcardEditor/components/ReferenceEditor";
import RichTextEditor from "@/components/FlashcardEditor/components/RichTextEditor";
import type { FlashcardData, FlashcardType } from "@/types";
import { textToDescendants } from "@/utils/flashcard";
import { Input, Segmented, Textarea } from "@tau/ui";
import { TYPE_LABEL, TYPE_ORDER } from "../model";
import { TYPE_ICON } from "../typeIcons";

import { createFormReference, type FormState } from "../editorModel";
import { AnswerFields } from "./AnswerFields";
import { Field } from "./Field";

export function CardEditorContent({
  form,
  revision,
  isDark,
  patch,
  patchData,
  changeType,
}: {
  form: FormState;
  revision: number;
  isDark: boolean;
  patch(next: Partial<FormState>): void;
  patchData(next: Partial<FlashcardData>): void;
  changeType(type: FlashcardType): void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Segmented
        size="sm"
        label="题型"
        value={form.type}
        onValueChange={(v: FlashcardType) => changeType(v)}
        className="self-start"
      >
        {TYPE_ORDER.map(type => (
          <Segmented.Item key={type} value={type} icon={TYPE_ICON[type]} label={TYPE_LABEL[type]} />
        ))}
      </Segmented>

      <Field
        label="题干"
        aux={form.type === "cloze" ? "选中文字后用工具栏设为填空，可给每个空设备选答案" : undefined}
      >
        <RichTextEditor
          key={`prompt-${revision}-${form.type === "cloze"}`}
          initialValue={form.prompt}
          onChange={value => patch({ prompt: value?.length ? value : textToDescendants("") })}
          allowBlanks={form.type === "cloze"}
          isDark={isDark}
          placeholder={form.type === "qa" ? "问题，或要记住的词条" : "题目内容"}
          minHeight="84px"
        />
      </Field>

      <Field label="补充说明" aux="可选，复习时显示在题干下方">
        <RichTextEditor
          key={`detail-${revision}`}
          initialValue={form.detail}
          onChange={value => patch({ detail: value?.length ? value : textToDescendants("") })}
          isDark={isDark}
          placeholder="背景、限定条件等"
          minHeight="56px"
        />
      </Field>

      <AnswerFields form={form} patchData={patchData} />

      <Field label="提示" aux="可选，复习时点开才显示">
        <Input
          value={form.data.hint ?? ""}
          onChange={e => patchData({ hint: e.target.value })}
          placeholder="一句话线索"
        />
      </Field>

      <Field label="解析" aux="可选，翻面后显示">
        <Textarea
          value={form.data.explanation ?? ""}
          onChange={e => patchData({ explanation: e.target.value })}
          placeholder="为什么是这个答案"
          rows={3}
        />
      </Field>

      <Field
        label="参考资料"
        aux="翻面后可展开查看"
        action={
          <button
            type="button"
            className="text-accent-text text-[12px] font-medium"
            onClick={() =>
              patch({
                references: [
                  ...form.references,
                  createFormReference({
                    refType: "content",
                    title: "",
                    contentId: undefined,
                    customContent: undefined,
                  }),
                ],
              })
            }
          >
            + 添加
          </button>
        }
      >
        {form.references.length === 0 ? (
          <p className="text-ink-3 text-[12px]">还没有参考资料</p>
        ) : (
          <div className="space-y-4">
            {form.references.map((ref, i) => (
              <ReferenceEditor
                key={`${revision}-${ref.formId}`}
                reference={ref}
                isDark={isDark}
                onChange={next =>
                  patch({
                    references: form.references.map((r, j) =>
                      j === i ? { ...next, formId: ref.formId } : r
                    ),
                  })
                }
                onRemove={() => patch({ references: form.references.filter((_, j) => j !== i) })}
              />
            ))}
          </div>
        )}
      </Field>
    </div>
  );
}
