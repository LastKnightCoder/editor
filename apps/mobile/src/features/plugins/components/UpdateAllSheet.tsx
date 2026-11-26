import { pluginTranslator, pluginCount, usePluginI18n, pluginPermission } from "../i18n";
import { Button } from "@tau/ui";
import { BottomSheet } from "../../../components/BottomSheet";
const t = pluginTranslator.t;

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
  usePluginI18n();
  return (
    <BottomSheet
      open={open}
      title={pluginCount("install.updateBatch", entries.length)}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 px-5 pb-4">
        <p className="text-ink-2 text-[13px] leading-relaxed">{t("install.batchHint")}</p>
        <ul aria-label={t("install.batchList")} className="flex flex-col gap-2.5">
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
                  {t("install.newPermissions", {
                    permissions: entry.newPermissions.map(pluginPermission).join("、"),
                  })}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          <Button className="min-h-11" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" className="min-h-11" onClick={onConfirm}>
            {t("center.updateAll")}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
