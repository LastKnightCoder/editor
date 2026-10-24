import { Button } from "@tau/ui";
import { BottomSheet } from "../../../components/BottomSheet";

export interface UpdateAllEntry {
  id: string;
  releaseId: string;
  name: string;
  from: string | null;
  to: string;
  /** 新版本相对已装版本新增申请的权限 */
  newPermissions: readonly string[];
}

/** 一键更新确认：逐个列出版本变化与新增权限，确认后全部进入应用级安装队列。 */
export function UpdateAllSheet({
  open,
  entries,
  onConfirm,
  onClose,
}: {
  open: boolean;
  entries: readonly UpdateAllEntry[];
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={open} title={`更新 ${entries.length} 个插件`} onClose={onClose}>
      <div className="flex flex-col gap-4 px-5 pb-4">
        <p className="text-ink-2 text-[13px] leading-relaxed">
          从插件中心依次下载并校验，关闭面板不影响下载。全部完成后在插件中心点「立即生效」即可切换到新版本。
        </p>
        <ul aria-label="待更新插件" className="flex flex-col gap-2.5">
          {entries.map(entry => (
            <li key={entry.id} className="flex flex-col gap-0.5 text-[13px]">
              <span className="flex items-baseline gap-2">
                <span className="text-ink-1 min-w-0 flex-1 truncate font-semibold">
                  {entry.name}
                </span>
                <span className="text-ink-3 shrink-0 tabular-nums">
                  {entry.from ? `v${entry.from} → ` : ""}v{entry.to}
                </span>
              </span>
              {entry.newPermissions.length > 0 && (
                <span className="text-warn text-[12px]">
                  新增权限：{entry.newPermissions.join("、")}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <Button className="min-h-11" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" className="min-h-11" onClick={onConfirm}>
            全部更新
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
