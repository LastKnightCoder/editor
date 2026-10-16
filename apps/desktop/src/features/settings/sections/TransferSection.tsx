/**
 * 导入与导出 —— 迁入 / 迁出的启动台：本页不承载流程，按钮关闭设置后打开对应浮层。
 * Markdown 导入与导出都处理本机资源：导入时图片与附件经当前资源存储入库，
 * 导出时打包进 assets/ 并改为相对路径。
 */

import { ArrowRight } from "lucide-react";
import { Button } from "@tau/ui";
import { useSettingsStore } from "@/app/settingsStore";
import { useTransferStore } from "@/app/transferStore";
import { SettingRow } from "../components/SettingRow";
import { SettingsGroup } from "../components/SettingsGroup";

export function TransferSection() {
  const openProjectExport = () => {
    useSettingsStore.getState().closeSettings();
    useTransferStore.getState().openProjectExport();
  };

  return (
    <>
      <SettingsGroup title="导出" description="本地图片、音视频和附件随文件打包，引用改为相对路径">
        <SettingRow
          title="导出项目"
          description="按文档树导出为 Markdown 包、合并 Markdown、PDF 或 EPUB，可勾选范围"
        >
          <Button variant="secondary" size="sm" icon={ArrowRight} onClick={openProjectExport}>
            选择项目
          </Button>
        </SettingRow>
        <SettingRow
          title="导出单篇"
          description="卡片、文章、项目文档的「导出 › Markdown 文件」：有本地资源时导出为 .zip（含 assets/）"
        />
      </SettingsGroup>
      <SettingsGroup
        title="导入"
        description="正文引用的本地图片与附件一并导入，存放到当前资源存储"
      >
        <SettingRow
          title="导入 Markdown 文件"
          description="在卡片页、文章页的「导入」，或项目文档树的「导入 Markdown」中选择文件；相对路径按 .md 所在目录解析"
        />
      </SettingsGroup>
    </>
  );
}
