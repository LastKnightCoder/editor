/**
 * 命令执行环境（M3-g）：AI 执行命令时用哪个 shell。
 * 默认自动检测（Windows 上找 Git Bash），检测不到时退回 PowerShell——
 * 装在非常规位置的用户在这里手填路径。设置里只存用户填的值，检测结果是本机事实不入设置。
 */

import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { SettingRow, Button, Input } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { piSessionShellInfo, type PiShellInfo } from "@/commands/piSession";
import { selectFile } from "@/commands";
import { SettingsGroup } from "../components/SettingsGroup";
import { FieldBox } from "../components/ProviderLayout";

export function AgentShellGroup() {
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
        { name: "可执行文件", extensions: ["exe", "sh"] },
        { name: "全部文件", extensions: ["*"] },
      ],
    });
    if (picked?.[0]) setPath(picked[0]);
  };

  const trimmed = configured.trim();
  const missing = trimmed.length > 0 && info?.configuredExists === false;
  const description = missing
    ? "这个路径不存在，暂时仍按自动检测的结果执行"
    : trimmed
      ? "已指定，AI 执行命令时使用它"
      : info?.detected
        ? `留空即自动检测，当前检测到：${info.detected}`
        : "留空即使用系统命令环境；Windows 未检测到 Git Bash 时使用 PowerShell";

  return (
    <SettingsGroup
      title="命令执行环境"
      description="AI 执行命令时使用的程序。一般不用管，只有装在非常规位置、或想换一个时才需要填。"
    >
      <SettingRow title="程序路径" description={description}>
        <FieldBox>
          <Input
            className="font-tau-mono"
            aria-label="命令执行程序路径"
            value={configured}
            placeholder={info?.detected ?? "自动检测"}
            spellCheck={false}
            onChange={event => setPath(event.target.value)}
          />
        </FieldBox>
        <Button variant="ghost" size="sm" icon={FolderOpen} onClick={() => void pick()}>
          浏览
        </Button>
        {trimmed && (
          <Button variant="ghost" size="sm" onClick={() => setPath("")}>
            恢复自动
          </Button>
        )}
      </SettingRow>
    </SettingsGroup>
  );
}
