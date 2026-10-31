import type { PluginContext, PluginSettingsDefinition } from "@tau/plugins";
import { Plus, ChevronRight } from "lucide-react";
import { useNavigator } from "../../../router";
import { GroupCard, GroupNote, GroupRow } from "../components/ui";
import { useImageDomain } from "./useImageDomain";

export function ImagePluginAccounts({
  entry,
}: {
  entry: { context: PluginContext; definition: PluginSettingsDefinition };
}) {
  const navigator = useNavigator();
  const { accounts } = useImageDomain();
  const settingsId = `${entry.context.pluginId}:${entry.definition.id}`;
  return (
    <div className="py-4">
      <GroupNote>
        填写账号连接和模型，在设置的「图片生成」中选用。保存配置不会切换当前服务。
      </GroupNote>
      <GroupCard>
        {accounts
          .filter(account => account.pluginId === entry.context.pluginId)
          .map(account => (
            <GroupRow
              key={account.id}
              onClick={() => navigator.push("imageAccount", { settingsId, accountId: account.id })}
            >
              <span className="text-ink-1 text-tau-body min-w-0 flex-1">{account.name}</span>
              <span className="text-ink-3 text-tau-sm truncate">{account.modelId}</span>
              <ChevronRight size={17} className="text-ink-3" />
            </GroupRow>
          ))}
        <GroupRow onClick={() => navigator.push("imageAccount", { settingsId })}>
          <Plus size={18} className="text-accent-text" />
          <span className="text-accent-text text-tau-body flex-1">添加图片账号</span>
        </GroupRow>
      </GroupCard>
    </div>
  );
}
