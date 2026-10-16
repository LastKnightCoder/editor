import { Check, Circle, Hourglass, X } from "lucide-react";
import { Button, IconButton, Panel, cn } from "@tau/ui";
import type { PortalApiError } from "../../api/errors";
import { Notice } from "../../components/Notice";
import { formatTime } from "../../components/format";
import type { CheckItem } from "./validation";

const SUBMIT_ERROR_TITLES: Partial<Record<PortalApiError["code"], string>> = {
  REPOSITORY_NOT_ALLOWED: "仓库验证未通过",
  GITHUB_UNAVAILABLE: "暂时无法连接 GitHub",
  INVALID_INPUT: "资料不完整",
  UPLOAD_NOT_READY: "文件未就绪",
  CONFLICT: "草稿已变化",
  REVISION_CONFLICT: "草稿已在其他窗口更新",
  SUBMISSION_LOCKED: "提交记录已冻结",
  VERSION_ALREADY_SUBMITTED: "该版本已有待审记录",
  PLUGIN_OWNERSHIP_CONFLICT: "插件 ID 归属冲突",
  LIMIT_EXCEEDED: "提交数量已达上限",
  NETWORK_ERROR: "提交结果未确认",
};

export function SubmitPanel({
  dirty,
  revision,
  updatedAt,
  saving,
  canSave,
  submitting,
  checklist,
  submitError,
  onSave,
  onSubmit,
  onDismissError,
}: {
  dirty: boolean;
  revision: number;
  updatedAt: string;
  saving: boolean;
  canSave: boolean;
  submitting: boolean;
  checklist: CheckItem[];
  submitError: PortalApiError | null;
  onSave: () => void;
  onSubmit: () => void;
  onDismissError: () => void;
}) {
  const pending = checklist.filter(item => !item.ok);
  const blockedBySave = pending.some(item => item.key === "saved" || item.key === "uploads");
  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className={cn("size-2 rounded-full", dirty ? "bg-warn" : "bg-ok")} aria-hidden />
        <p className="text-tau-sm text-ink-1 font-medium">{dirty ? "有未保存的修改" : "已保存"}</p>
        <p className="text-tau-micro text-ink-3 ml-auto" title={`修订 ${revision}`}>
          {formatTime(updatedAt)}
        </p>
      </div>
      {dirty && (
        <p className="text-tau-micro text-ink-3 -mt-2">
          修改已暂存在此浏览器，保存后才会同步到服务端。
        </p>
      )}

      <Button
        block
        variant={dirty ? "primary" : "secondary"}
        disabled={!canSave}
        loading={saving}
        loadingText="保存中…"
        onClick={onSave}
      >
        保存草稿
      </Button>

      <div className="border-line-1 flex flex-col gap-2 border-t pt-4">
        <h3 className="text-tau-meta text-ink-1 font-medium">提交前检查</h3>
        <ul className="flex flex-col gap-1.5">
          {checklist.map(item => (
            <li
              key={item.key}
              className={cn(
                "text-tau-sm flex items-start gap-2",
                item.ok ? "text-ink-2" : "text-ink-1"
              )}
            >
              {item.ok ? (
                <Check
                  size={15}
                  strokeWidth={2.2}
                  className="text-ok mt-[3px] shrink-0"
                  aria-label="已完成"
                />
              ) : (
                <Circle
                  size={13}
                  strokeWidth={2}
                  className="text-ink-3 mt-1 shrink-0"
                  aria-label="未完成"
                />
              )}
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      {submitError && (
        <Notice
          tone="danger"
          title={SUBMIT_ERROR_TITLES[submitError.code] ?? "提交失败"}
          actions={
            <IconButton aria-label="关闭" onClick={onDismissError}>
              <X size={14} />
            </IconButton>
          }
        >
          {submitError.message}
        </Notice>
      )}

      <Button
        block
        variant="primary"
        icon={Hourglass}
        loading={submitting}
        loadingText="提交中…"
        disabled={submitting || saving || blockedBySave}
        onClick={onSubmit}
      >
        提交审核
      </Button>
      <p className="text-tau-micro text-ink-3 leading-[1.6]">
        {blockedBySave
          ? "请先完成上传并保存修改。"
          : "提交时服务端会验证仓库权限与 commit。提交后进入待审核，内容冻结，本期不能修改或撤回。"}
      </p>
    </Panel>
  );
}
