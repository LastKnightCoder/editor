import { useImportI18n } from "@/features/transfer/i18n-import";
/**
 * 导入与导出 —— 迁入 / 迁出的启动台与导入记录：按钮关闭设置后打开对应浮层，本页不承载流程。
 * 导入记录按当前数据库列出，可查看提醒或整批撤销（删除该批建出的项目 / 文章 / 卡片）。
 */

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { SettingRow, Button, ConfirmDialog, Dialog, DialogBody, toast } from "@tau/ui";
import { useSettingsStore } from "@/app/settingsStore";
import { useTransferStore } from "@/app/transferStore";
import { undoImport } from "@/services/batch-import";
import useSettingStore from "@/stores/useSettingStore";
import { useImportHistoryStore, type ImportRecord } from "@/stores/useImportHistoryStore";
import { SettingsGroup } from "../components/SettingsGroup";

type ImportText = ReturnType<typeof useImportI18n>["t"];
const recordTitle = (record: ImportRecord, t: ImportText, locale: string) =>
  record.target === "project"
    ? t("history.project", {
        source: record.sourceName,
        title: record.projectTitle || record.sourceName,
      })
    : t(`history.${record.target}`, {
        source: record.sourceName,
        count: record.docCount,
        amount: record.docCount.toLocaleString(locale),
      });
const recordMeta = (record: ImportRecord, t: ImportText, locale: string) => {
  const countText = (key: Parameters<typeof t>[0], count: number) =>
    t(key, { count, amount: count.toLocaleString(locale) });
  return [
    new Date(record.at).toLocaleString(locale, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    record.target === "project" ? countText("count.project", record.docCount) : "",
    countText("history.assets", record.assetCount),
    record.databaseIds?.length ? countText("history.databases", record.databaseIds.length) : "",
    record.stopped ? t("history.incomplete") : "",
    record.warnings.length > 0 ? countText("stats.warnings", record.warnings.length) : "",
  ]
    .filter(Boolean)
    .join(" · ");
};

export function TransferSection() {
  const { t, locale } = useImportI18n();
  const database = useSettingStore(s => s.setting.database.active);
  const records = useImportHistoryStore(s => s.records).filter(r => r.database === database);
  const [undoing, setUndoing] = useState<ImportRecord | null>(null);
  const [viewing, setViewing] = useState<ImportRecord | null>(null);

  const leaveTo = (open: () => void) => {
    useSettingsStore.getState().closeSettings();
    open();
  };

  const undo = async () => {
    if (!undoing) return;
    try {
      await undoImport(undoing);
      toast.success(t("undo.done"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("undo.failed"));
    }
  };

  return (
    <>
      <SettingsGroup title={t("settings.import")} description={t("settings.importHint")}>
        <SettingRow title={t("settings.folder")} description={t("settings.folderHint")}>
          <Button
            variant="secondary"
            size="sm"
            icon={ArrowRight}
            onClick={() => leaveTo(() => useTransferStore.getState().openImportWizard())}
          >
            {t("settings.source")}
          </Button>
        </SettingRow>
        <SettingRow title={t("settings.markdown")} description={t("settings.markdownHint")} />
      </SettingsGroup>

      <SettingsGroup title={t("settings.export")} description={t("settings.exportHint")}>
        <SettingRow title={t("settings.markdownZip")} description={t("settings.markdownZipHint")}>
          <Button
            variant="secondary"
            size="sm"
            icon={ArrowRight}
            onClick={() => leaveTo(() => useTransferStore.getState().openMarkdownExport())}
          >
            {t("settings.scope")}
          </Button>
        </SettingRow>
        <SettingRow title={t("settings.pdfEpub")} description={t("settings.pdfEpubHint")} />
        <SettingRow title={t("settings.single")} description={t("settings.singleHint")} />
      </SettingsGroup>

      {records.length > 0 && (
        <SettingsGroup title={t("history.title")} description={t("history.hint")}>
          {records.map(record => (
            <SettingRow
              key={record.id}
              title={recordTitle(record, t, locale)}
              description={recordMeta(record, t, locale)}
            >
              {record.warnings.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setViewing(record)}>
                  {t("history.warnings")}
                </Button>
              )}
              <Button variant="danger-soft" size="sm" onClick={() => setUndoing(record)}>
                {t("history.undo")}
              </Button>
            </SettingRow>
          ))}
        </SettingsGroup>
      )}

      <ConfirmDialog
        open={!!undoing}
        onOpenChange={open => !open && setUndoing(null)}
        danger
        title={t("history.undoTitle")}
        context={undoing ? recordTitle(undoing, t, locale) : undefined}
        description={t(
          undoing?.target === "project"
            ? undoing.databaseIds?.length
              ? "history.undoProjectDatabases"
              : "history.undoProject"
            : undoing?.databaseIds?.length
              ? "history.undoContentDatabases"
              : "history.undoContent"
        )}
        impact={t("undo.impact")}
        confirmText={t("undo.confirm")}
        onConfirm={undo}
      />
      <Dialog
        title={t("history.warningsTitle")}
        context={viewing ? recordTitle(viewing, t, locale) : undefined}
        open={!!viewing}
        onOpenChange={open => !open && setViewing(null)}
        size="lg"
      >
        <DialogBody>
          <ul className="text-ink-2 text-tau-sm leading-relaxed">
            {viewing?.warnings.map((warning, index) => (
              <li key={index} className="break-all">
                {warning}
              </li>
            ))}
          </ul>
        </DialogBody>
      </Dialog>
    </>
  );
}
