/**
 * 命令执行环境：AI 执行命令时用哪个 shell。
 * 默认自动检测（Windows 上找 Git Bash），检测不到时退回 PowerShell——
 * 装在非常规位置的用户在这里手填路径。设置里只存用户填的值，检测结果是本机事实不入设置。
 */

import { llmText, llmValue, useLlmSettingsI18n } from "./llm.i18n";
import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { SettingRow, Button, Input } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { piSessionShellInfo, type PiShellInfo } from "@/commands/piSession";
import { selectFile } from "@/commands";
import { SettingsGroup } from "../components/SettingsGroup";
import { FieldBox } from "../components/ProviderLayout";

export function AgentShellGroup() {
  useLlmSettingsI18n();

  const configured = useSettingStore(s => s.setting.agentShell?.path ?? "");
  const setPath = useSettingStore(s => s.setAgentShellPath);
  const [info, setInfo] = useState<PiShellInfo | null>(null);

  // 路径变化后重新问主进程：是否存在、最终会用哪个
  useEffect(() => {
    let alive = true;
    void piSessionShellInfo(configured)
      .then(result => {
        if (alive) setInfo(result);
      })
      .catch(error => console.error("读取命令执行环境失败:", error));
    return () => {
      alive = false;
    };
  }, [configured]);

  const pick = async () => {
    const picked = await selectFile({
      properties: ["openFile"],
      filters: [
        { name: llmText("ui.executableFiles"), extensions: ["exe", "sh"] },
        { name: llmText("ui.allFiles"), extensions: ["*"] },
      ],
    });
    if (picked?.[0]) setPath(picked[0]);
  };

  const trimmed = configured.trim();
  const missing = trimmed.length > 0 && info?.configuredExists === false;
  const description = missing
    ? llmText("ui.thisPathDoesNotExistTheDetected")
    : trimmed
      ? llmText("ui.aiUsesThisProgramToRunCommands")
      : info?.detected
        ? llmText("message.leaveBlankForAutomaticDetectionDetected", {
            path: llmValue(info.detected),
          })
        : llmText("ui.leaveBlankToUseTheSystemShell");

  return (
    <SettingsGroup
      title={llmText("ui.commandEnvironment")}
      description={llmText("ui.theProgramAIUsesToRunCommands")}
    >
      <SettingRow title={llmText("ui.programPath")} description={description}>
        <FieldBox>
          <Input
            className="font-tau-mono"
            aria-label={llmText("ui.commandProgramPath")}
            value={configured}
            placeholder={info?.detected ?? llmText("ui.detectAutomatically")}
            spellCheck={false}
            onChange={event => setPath(event.target.value)}
          />
        </FieldBox>
        <Button variant="ghost" size="sm" icon={FolderOpen} onClick={() => void pick()}>
          {llmText("ui.browse")}
        </Button>
        {trimmed && (
          <Button variant="ghost" size="sm" onClick={() => setPath("")}>
            {llmText("ui.restoreAutomaticDetection")}
          </Button>
        )}
      </SettingRow>
    </SettingsGroup>
  );
}
