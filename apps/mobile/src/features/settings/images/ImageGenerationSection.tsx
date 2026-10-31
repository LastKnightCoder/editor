import { useState } from "react";
import { isProviderFormComplete } from "@tau/plugins";
import { Check, ChevronRight } from "lucide-react";
import { useNavigator } from "../../../router";
import { GroupCard, GroupNote, GroupRow } from "../components/ui";
import { GroupLabel } from "../../../components/GroupLabel";
import type { ImageProviderConfig } from "../../../types";
import { useImageDomain } from "./useImageDomain";

export function ImageGenerationSection() {
  const navigator = useNavigator();
  const { setting, providers, accounts, currentId, mutate } = useImageDomain();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const select = async (account: ImageProviderConfig) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await mutate({ type: "select", id: account.id, expectedProvider: account });
    } catch {
      setError("图片服务未切换，请检查账号配置后重试");
    } finally {
      setBusy(false);
    }
  };
  if (!setting) return <p className="text-ink-3 py-8 text-center">正在读取图片设置…</p>;
  return (
    <div className="page-enter">
      <GroupLabel>当前图片服务</GroupLabel>
      <GroupCard>
        {accounts.length ? (
          accounts.map(account => {
            const provider = providers.find(item => item.context.pluginId === account.pluginId);
            const ready =
              !!provider?.definition.form &&
              !!account.modelId &&
              isProviderFormComplete(provider.definition.form, account.config);
            return (
              <div key={account.id} className="flex items-center">
                <button
                  type="button"
                  disabled={!ready || busy}
                  aria-pressed={currentId === account.id}
                  className="text-tau-body flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3.5 py-3 text-left disabled:opacity-50"
                  onClick={() => void select(account)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-ink-1 block truncate font-medium">{account.name}</span>
                    <span className="text-ink-3 text-tau-sm block truncate">
                      {provider
                        ? ready
                          ? account.modelId
                          : "请先完成配置"
                        : "插件已停用，配置已保留"}
                    </span>
                  </span>
                  {currentId === account.id && (
                    <Check size={18} className="text-accent" aria-label="当前选用" />
                  )}
                </button>
                {provider && (
                  <button
                    type="button"
                    aria-label={`配置${account.name}`}
                    className="text-accent-text text-tau-sm min-h-11 px-3"
                    onClick={() =>
                      navigator.push("imageAccount", {
                        settingsId: provider.id,
                        accountId: account.id,
                      })
                    }
                  >
                    配置
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-ink-3 text-tau-body px-3.5 py-4">
            先安装图片插件并添加账号，再选择用于对话的图片服务。
          </p>
        )}
      </GroupCard>
      <GroupNote>
        对话中的图片生成和编辑使用当前选用的账号。生成结果按「图片与附件」中的上传位置保存。
      </GroupNote>
      {error && (
        <p role="alert" className="text-danger text-tau-meta py-2">
          {error}
        </p>
      )}
      <GroupLabel>图片插件</GroupLabel>
      <GroupCard>
        {providers.map(provider => (
          <GroupRow
            key={provider.id}
            onClick={() => navigator.push("pluginSettings", { id: provider.id })}
          >
            <span className="text-ink-1 text-tau-body min-w-0 flex-1">
              {provider.definition.title}
            </span>
            <span className="text-ink-3 text-tau-sm">账号与配置</span>
            <ChevronRight size={17} className="text-ink-3" />
          </GroupRow>
        ))}
        <GroupRow onClick={() => navigator.push("plugins", { tab: "store" })}>
          <span className="text-accent-text text-tau-body flex-1">去插件中心下载</span>
          <ChevronRight size={17} className="text-ink-3" />
        </GroupRow>
      </GroupCard>
    </div>
  );
}
