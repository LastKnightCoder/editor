/**
 * 导入与导出 —— 迁入 / 迁出的启动台与导入记录：按钮关闭设置后打开对应浮层，本页不承载流程。
 * 导入记录按当前数据库列出，可查看提醒或整批撤销（删除该批建出的项目 / 文章 / 卡片）。
 */

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button, ConfirmDialog, Dialog, DialogBody, toast } from "@tau/ui";
import { useSettingsStore } from "@/app/settingsStore";
import { useTransferStore } from "@/app/transferStore";
import { undoImport } from "@/services/batch-import";
import useSettingStore from "@/stores/useSettingStore";
import { useImportHistoryStore, type ImportRecord } from "@/stores/useImportHistoryStore";
import { SettingRow } from "../components/SettingRow";
import { SettingsGroup } from "../components/SettingsGroup";

const recordTitle = (record: ImportRecord) =>
  record.target === "project"
    ? `${record.sourceName} → 项目「${record.projectTitle || record.sourceName}」`
    : `${record.sourceName} → ${record.docCount} ${record.target === "card" ? "张卡片" : "篇文章"}`;

const recordMeta = (record: ImportRecord) =>
  [
    new Date(record.at).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    record.target === "project" ? `${record.docCount} 篇` : "",
    `${record.assetCount} 个资源`,
    record.stopped ? "未完成" : "",
    record.warnings.length > 0 ? `${record.warnings.length} 条提醒` : "",
  ]
    .filter(Boolean)
    .join(" · ");

export function TransferSection() {
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
      toast.success("已撤销这次导入");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "撤销失败");
    }
  };

  return (
    <>
      <SettingsGroup
        title="导入"
        description="正文引用的本地图片与附件一并导入，存放到当前资源存储"
      >
        <SettingRow
          title="导入文件夹或压缩包"
          description="导入为项目（保持目录树）、文章或卡片；文档之间的 .md 链接转为应用内链接，导入前可预览"
        >
          <Button
            variant="secondary"
            size="sm"
            icon={ArrowRight}
            onClick={() => leaveTo(() => useTransferStore.getState().openImportWizard())}
          >
            选择来源
          </Button>
        </SettingRow>
        <SettingRow
          title="导入 Markdown 文件"
          description="卡片页、文章页的「导入」，或项目文档树的「导入 Markdown」；相对路径按 .md 所在目录解析"
        />
      </SettingsGroup>

      <SettingsGroup title="导出" description="本地图片、音视频和附件随文件打包，引用改为相对路径">
        <SettingRow
          title="导出项目"
          description="按文档树导出为 Markdown 包、合并 Markdown、PDF 或 EPUB，可勾选范围"
        >
          <Button
            variant="secondary"
            size="sm"
            icon={ArrowRight}
            onClick={() => leaveTo(() => useTransferStore.getState().openProjectExport())}
          >
            选择项目
          </Button>
        </SettingRow>
        <SettingRow
          title="导出单篇"
          description="卡片、文章、项目文档的「导出 › Markdown 文件」：有本地资源时导出为 .zip（含 assets/）"
        />
      </SettingsGroup>

      {records.length > 0 && (
        <SettingsGroup
          title="导入记录"
          description="当前数据库最近的批量导入；撤销会删除该批导入的全部内容"
        >
          {records.map(record => (
            <SettingRow
              key={record.id}
              title={recordTitle(record)}
              description={recordMeta(record)}
            >
              {record.warnings.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setViewing(record)}>
                  提醒
                </Button>
              )}
              <Button variant="danger-soft" size="sm" onClick={() => setUndoing(record)}>
                撤销
              </Button>
            </SettingRow>
          ))}
        </SettingsGroup>
      )}

      <ConfirmDialog
        open={!!undoing}
        onOpenChange={open => !open && setUndoing(null)}
        danger
        title="撤销这次导入"
        context={undoing ? recordTitle(undoing) : undefined}
        description={
          undoing?.target === "project"
            ? "将删除这次导入建出的项目及其全部文档，导入后做的修改也会一并删除。"
            : "将删除这次导入的全部内容，导入后做的修改也会一并删除。"
        }
        impact="已上传的图片与附件文件保留"
        confirmText="撤销导入"
        onConfirm={undo}
      />
      <Dialog
        title="导入提醒"
        context={viewing ? recordTitle(viewing) : undefined}
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
