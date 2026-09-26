/**
 * 工具权限（D-060 通用工具权限模式）：AI 修改内容、执行脚本前要不要先问你。
 * 模式全局生效，对话里等待确认时也可点「本会话始终允许」。
 */

import { Check } from "lucide-react";
import { cn } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { TOOL_PERMISSION_MODES, normalizePermissionMode } from "@/services/tool-permission/mode";
import { SettingsGroup } from "../components/SettingsGroup";

export function ToolPermissionGroup() {
  const mode = useSettingStore(s => normalizePermissionMode(s.setting.agentPermission?.mode));
  const setMode = useSettingStore(s => s.setToolPermissionMode);

  return (
    <>
      <SettingsGroup
        title="工具权限"
        description="决定 AI 修改你的内容、执行 Skill 脚本前是否先征得同意。只读类工具（检索、查询）始终直接执行。"
      >
        <div role="radiogroup" aria-label="工具权限模式" className="flex flex-col gap-1 p-1.5">
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
                    {option.label}
                  </b>
                  <span className="text-tau-meta text-ink-2">{option.description}</span>
                </span>
                {active && <Check className="text-accent-text size-4 shrink-0" strokeWidth={2} />}
              </button>
            );
          })}
        </div>
      </SettingsGroup>
      <SettingsGroup bare title="说明">
        <ul className="text-tau-meta text-ink-2 m-0 list-disc space-y-1 pl-6">
          <li>
            「修改内容」目前包括 AI 改写 / 编辑文档；手动确认时通过审阅卡「确认应用 / 拒绝」。
          </li>
          <li>「执行代码」目前是运行 Skill 附带的脚本；需要确认时对话里会出现确认条。</li>
          <li>
            浏览器扩展、子代理等看不到确认条的入口，需要确认的工具会被直接拒绝；切到「跳过确认」则照常执行。
          </li>
        </ul>
      </SettingsGroup>
    </>
  );
}
