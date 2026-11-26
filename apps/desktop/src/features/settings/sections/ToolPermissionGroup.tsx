/**
 * 工具权限（通用工具权限模式）：AI 修改内容、执行脚本前要不要先问你。
 * 模式全局生效，对话里等待确认时也可点「本会话始终允许」。
 */

import { llmText, useLlmSettingsI18n } from "./llm.i18n";
import { Check } from "lucide-react";
import { cn } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { TOOL_PERMISSION_MODES, normalizePermissionMode } from "@/services/tool-permission/mode";
import { SettingsGroup } from "../components/SettingsGroup";

export function ToolPermissionGroup() {
  useLlmSettingsI18n();

  const mode = useSettingStore(s => normalizePermissionMode(s.setting.agentPermission?.mode));
  const setMode = useSettingStore(s => s.setToolPermissionMode);

  return (
    <>
      <SettingsGroup
        title={llmText("ui.toolPermissions")}
        description={llmText("ui.chooseWhetherAIAsksBeforeEditingContent")}
      >
        <div
          role="radiogroup"
          aria-label={llmText("ui.toolPermissionMode")}
          className="flex flex-col gap-1 p-1.5"
        >
          {TOOL_PERMISSION_MODES.map(option => {
            const active = option.value === mode;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMode(option.value)}
                className={cn(
                  "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors duration-150",
                  active ? "bg-selected" : "hover:bg-hover"
                )}
              >
                <span className="min-w-0 flex-1">
                  <b
                    className={cn(
                      "text-tau-body block font-semibold",
                      active && "text-accent-text"
                    )}
                  >
                    {llmText(`permission.${option.value}.label`)}
                  </b>
                  <span className="text-tau-meta text-ink-2">
                    {llmText(`permission.${option.value}.description`)}
                  </span>
                </span>
                {active && <Check className="text-accent-text size-4 shrink-0" strokeWidth={2} />}
              </button>
            );
          })}
        </div>
      </SettingsGroup>
      <SettingsGroup bare title={llmText("ui.details")}>
        <ul className="text-tau-meta text-ink-2 m-0 list-disc space-y-1 pl-6">
          <li>{llmText("ui.editContentIncludesAIRewritingAndDocument")}</li>
          <li>{llmText("ui.runCodeRunsScriptsProvidedBySkills")}</li>
          <li>{llmText("ui.toolsNeedingApprovalAreRejectedInThe")}</li>
        </ul>
      </SettingsGroup>
    </>
  );
}
