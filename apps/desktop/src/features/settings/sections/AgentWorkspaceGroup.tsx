/**
 * AI 对话的默认工作目录：AI 执行命令、读写文件的位置。
 * 只决定 AI 对话页 / 停靠栏的新对话从哪里开始——每个对话在对话栏里还能各自换目录，已有对话不受这里影响。
 * 学习项目、PDF、视频笔记的对话目录由场景决定，不受这里影响。
 */

import { FolderOpen } from "lucide-react";
import { SettingRow, Button, Input } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { selectDirectoryWithDialog } from "@/commands";
import { useWorkspaceInfo } from "@/features/chat/workspaceQueries";
import { SettingsGroup } from "../components/SettingsGroup";
import { FieldBox } from "../components/ProviderLayout";

export function AgentWorkspaceGroup() {
  const configured = useSettingStore(s => s.setting.agentWorkspace?.defaultCwd ?? "");
  const setDefaultCwd = useSettingStore(s => s.setAgentDefaultCwd);
  const trimmed = configured.trim();
  const { data: info } = useWorkspaceInfo(trimmed);

  const pick = async () => {
    const picked = await selectDirectoryWithDialog();
    if (picked) setDefaultCwd(picked);
  };

  const description = info?.missing
    ? "这个目录不存在，新对话暂时仍在应用数据目录里执行"
    : trimmed
      ? "新对话在这里执行命令、读写文件"
      : info
        ? `留空即应用数据目录：${info.path}`
        : "留空即应用数据目录";

  return (
    <SettingsGroup
      title="工作目录"
      description="AI 对话页与停靠栏里，新对话执行命令、读写文件的位置。每个对话还可以在输入框上方单独切换目录。"
    >
      <SettingRow title="默认目录" description={description}>
        <FieldBox>
          <Input
            className="font-tau-mono"
            aria-label="默认工作目录"
            value={configured}
            placeholder={info?.isAppDir ? info.path : "应用数据目录"}
            spellCheck={false}
            onChange={event => setDefaultCwd(event.target.value)}
          />
        </FieldBox>
        <Button variant="ghost" size="sm" icon={FolderOpen} onClick={() => void pick()}>
          浏览
        </Button>
        {trimmed && (
          <Button variant="ghost" size="sm" onClick={() => setDefaultCwd("")}>
            恢复默认
          </Button>
        )}
      </SettingRow>
    </SettingsGroup>
  );
}
