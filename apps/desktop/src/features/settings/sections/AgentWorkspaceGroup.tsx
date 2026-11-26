/**
 * AI 对话的默认工作目录：AI 执行命令、读写文件的位置。
 * 只决定 AI 对话页 / 停靠栏的新对话从哪里开始——每个对话在对话栏里还能各自换目录，已有对话不受这里影响。
 * 学习项目、PDF、视频笔记的对话目录由场景决定，不受这里影响。
 */

import { llmText, llmValue, useLlmSettingsI18n } from "./llm.i18n";
import { FolderOpen } from "lucide-react";
import { SettingRow, Button, Input } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { selectDirectoryWithDialog } from "@/commands";
import { useWorkspaceInfo } from "@/features/chat/workspaceQueries";
import { SettingsGroup } from "../components/SettingsGroup";
import { FieldBox } from "../components/ProviderLayout";

export function AgentWorkspaceGroup() {
  useLlmSettingsI18n();

  const configured = useSettingStore(s => s.setting.agentWorkspace?.defaultCwd ?? "");
  const setDefaultCwd = useSettingStore(s => s.setAgentDefaultCwd);
  const trimmed = configured.trim();
  const { data: info } = useWorkspaceInfo(trimmed);

  const pick = async () => {
    const picked = await selectDirectoryWithDialog();
    if (picked) setDefaultCwd(picked);
  };

  const description = info?.missing
    ? llmText("ui.thisFolderDoesNotExistNewChats")
    : trimmed
      ? llmText("ui.newChatsRunCommandsAndReadOr")
      : info
        ? llmText("message.leaveBlankForTheAppDataFolder", { path: llmValue(info.path) })
        : llmText("ui.leaveBlankToUseTheAppData");

  return (
    <SettingsGroup
      title={llmText("ui.workingFolder")}
      description={llmText("ui.whereNewChatsRunCommandsAndRead")}
    >
      <SettingRow title={llmText("ui.defaultFolder")} description={description}>
        <FieldBox>
          <Input
            className="font-tau-mono"
            aria-label={llmText("ui.defaultWorkingFolder")}
            value={configured}
            placeholder={info?.isAppDir ? info.path : llmText("ui.appDataFolder")}
            spellCheck={false}
            onChange={event => setDefaultCwd(event.target.value)}
          />
        </FieldBox>
        <Button variant="ghost" size="sm" icon={FolderOpen} onClick={() => void pick()}>
          {llmText("ui.browse")}
        </Button>
        {trimmed && (
          <Button variant="ghost" size="sm" onClick={() => setDefaultCwd("")}>
            {llmText("ui.restoreDefault")}
          </Button>
        )}
      </SettingRow>
    </SettingsGroup>
  );
}
