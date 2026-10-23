import { Button, Checkbox, Panel, Textarea } from "@tau/ui";
import { Notice } from "../../components/Notice";
import { PLATFORM_LABELS, PORTABLE_PLATFORMS, type PortablePlatform } from "../catalog/platforms";

/** 审核者对一个平台的验证填写；提交前由逻辑层映射为审核请求。 */
export interface PlatformEvidenceDraft {
  verified: boolean;
  note: string;
}
export type PlatformEvidenceValue = Partial<Record<PortablePlatform, PlatformEvidenceDraft>>;

const EMPTY: PlatformEvidenceDraft = { verified: false, note: "" };

/**
 * 逐声明平台的验证证据。只列包内声明的平台；是否满足审核要求由逻辑层判定，
 * 这里只展示填写进度与服务端返回的冲突/失败。
 */
export function PlatformEvidence({
  platforms,
  value,
  onChange,
  readOnly,
  disabled,
  error,
  conflict,
  noteMaxLength = 1000,
}: {
  platforms: readonly PortablePlatform[];
  value: PlatformEvidenceValue;
  onChange?: (platform: PortablePlatform, draft: PlatformEvidenceDraft) => void;
  readOnly?: boolean;
  disabled?: boolean;
  /** 提交失败的说明。 */
  error?: string | null;
  /** 他人已更新审核记录时的处理入口。 */
  conflict?: { message: string; onReload: () => void } | null;
  noteMaxLength?: number;
}) {
  const declared = PORTABLE_PLATFORMS.filter(platform => platforms.includes(platform));
  const done = declared.filter(platform => value[platform]?.verified).length;
  return (
    <Panel pad="none" className="overflow-hidden">
      <header className="border-line-1 flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h2 className="text-tau-body text-ink-1 font-semibold">平台验证</h2>
        <span className="text-tau-micro text-ink-3" aria-live="polite">
          已验证 {done}/{declared.length}
        </span>
      </header>
      <div className="flex flex-col gap-3 px-4 py-3">
        <p className="text-tau-sm text-ink-3">
          每个声明的平台都需要用本版本 ZIP
          实测。未通过的平台应由作者从清单移除后重新打包，不能在这里修改声明。
        </p>
        {conflict && (
          <Notice
            tone="warn"
            title="审核记录已更新"
            actions={<Button onClick={conflict.onReload}>载入最新</Button>}
          >
            {conflict.message}
          </Notice>
        )}
        {error && (
          <Notice tone="danger" title="保存失败">
            {error}
          </Notice>
        )}
        {declared.map(platform => {
          const label = PLATFORM_LABELS[platform];
          const draft = value[platform] ?? EMPTY;
          return (
            <fieldset
              key={platform}
              className="border-line-1 rounded-tau-md flex flex-col gap-2 border p-3"
              disabled={disabled || readOnly}
            >
              <legend className="text-tau-body text-ink-1 px-1 font-semibold">{label}</legend>
              {readOnly ? (
                <>
                  <p className={draft.verified ? "text-tau-sm text-ok" : "text-tau-sm text-ink-3"}>
                    {draft.verified ? "已验证" : "未验证"}
                  </p>
                  {draft.note && (
                    <p className="text-tau-sm text-ink-2 whitespace-pre-wrap break-words">
                      {draft.note}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Checkbox
                    label={`已在${label}上验证此版本`}
                    checked={draft.verified}
                    onChange={event =>
                      onChange?.(platform, { ...draft, verified: event.target.checked })
                    }
                  />
                  <Textarea
                    aria-label={`${label}验证说明`}
                    placeholder="设备与系统版本、验证步骤、发现的问题"
                    maxLength={noteMaxLength}
                    value={draft.note}
                    onChange={event => onChange?.(platform, { ...draft, note: event.target.value })}
                  />
                </>
              )}
            </fieldset>
          );
        })}
      </div>
    </Panel>
  );
}
