import { useState } from "react";
import { Eye, PenLine } from "lucide-react";
import { Button, FormField, Input, Textarea } from "@tau/ui";
import type { Listing } from "../../../../contracts";
import { Markdown } from "../../components/markdown/Markdown";
import { Section } from "./Section";
import {
  FIELD_LABELS,
  TEXT_LIMITS,
  normalizeCommit,
  normalizeRepository,
  type FieldErrors,
  type TextField,
} from "./validation";

type Patch = (patch: Partial<Listing>) => void;

/** 详细介绍：编辑与预览切换；预览只渲染受支持的 Markdown 子集 */
function DescriptionField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <FormField
      label={FIELD_LABELS.description}
      required
      error={error}
      description="支持 Markdown（标题、列表、引用、代码、链接）；HTML 标签按原文显示，不会执行。"
    >
      {field => (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1" role="group" aria-label="编辑或预览">
            <Button
              size="sm"
              variant={preview ? "ghost" : "soft"}
              icon={PenLine}
              aria-pressed={!preview}
              onClick={() => setPreview(false)}
            >
              编辑
            </Button>
            <Button
              size="sm"
              variant={preview ? "soft" : "ghost"}
              icon={Eye}
              aria-pressed={preview}
              onClick={() => setPreview(true)}
            >
              预览
            </Button>
          </div>
          {preview ? (
            <div className="border-line-1 rounded-tau-sm min-h-[240px] border px-4 py-3">
              {value.trim() ? (
                <Markdown source={value} />
              ) : (
                <p className="text-tau-sm text-ink-3">还没有内容</p>
              )}
            </div>
          ) : (
            <Textarea
              {...field}
              rows={12}
              maxLength={TEXT_LIMITS.description}
              value={value}
              onChange={event => onChange(event.target.value)}
              placeholder={"## 功能\n\n- 这个插件能做什么\n- 如何开始使用"}
            />
          )}
        </div>
      )}
    </FormField>
  );
}

function TextInput({
  name,
  listing,
  errors,
  onPatch,
  placeholder,
  hint,
  normalize,
  mono,
}: {
  name: TextField;
  listing: Listing;
  errors: FieldErrors;
  onPatch: Patch;
  placeholder?: string;
  hint?: string;
  normalize?: (value: string) => string;
  mono?: boolean;
}) {
  return (
    <FormField label={FIELD_LABELS[name]} required error={errors[name]} description={hint}>
      {field => (
        <Input
          {...field}
          value={listing[name]}
          maxLength={TEXT_LIMITS[name]}
          placeholder={placeholder}
          spellCheck={false}
          className={mono ? "font-tau-mono" : undefined}
          onChange={event => onPatch({ [name]: event.target.value })}
          onBlur={normalize ? () => onPatch({ [name]: normalize(listing[name]) }) : undefined}
        />
      )}
    </FormField>
  );
}

export function IntroSection({
  listing,
  errors,
  onPatch,
}: {
  listing: Listing;
  errors: FieldErrors;
  onPatch: Patch;
}) {
  return (
    <Section
      index={3}
      title="介绍"
      description="由你填写，展示给使用者；不会从 ZIP 或仓库 README 自动读取。"
    >
      <TextInput
        name="summary"
        listing={listing}
        errors={errors}
        onPatch={onPatch}
        placeholder="一句话说明插件做什么"
        hint={`${listing.summary.length} / ${TEXT_LIMITS.summary}`}
      />
      <DescriptionField
        value={listing.description}
        error={errors.description}
        onChange={description => onPatch({ description })}
      />
      <FormField
        label={FIELD_LABELS.changelog}
        required
        error={errors.changelog}
        description="本版本相对上一版的变化；首次提交可写「首次发布」。"
      >
        {field => (
          <Textarea
            {...field}
            rows={4}
            maxLength={TEXT_LIMITS.changelog}
            value={listing.changelog}
            onChange={event => onPatch({ changelog: event.target.value })}
          />
        )}
      </FormField>
    </Section>
  );
}

export function SourceSection({
  listing,
  errors,
  onPatch,
}: {
  listing: Listing;
  errors: FieldErrors;
  onPatch: Patch;
}) {
  return (
    <Section
      index={4}
      title="源码与支持"
      description="第一期要求公开源码。提交时服务端会验证你对该仓库的管理权限并确认 commit 存在；暂不校验源码与 ZIP 是否一致。"
    >
      <TextInput
        name="repository"
        listing={listing}
        errors={errors}
        onPatch={onPatch}
        placeholder="https://github.com/owner/repo"
        normalize={normalizeRepository}
      />
      <TextInput
        name="commit"
        listing={listing}
        errors={errors}
        onPatch={onPatch}
        placeholder="40 位完整 SHA"
        hint="构建该 ZIP 所用的提交"
        normalize={normalizeCommit}
        mono
      />
      <TextInput
        name="supportUrl"
        listing={listing}
        errors={errors}
        onPatch={onPatch}
        placeholder="https://github.com/owner/repo/issues"
        hint="使用者反馈问题的 HTTPS 地址"
      />
    </Section>
  );
}
