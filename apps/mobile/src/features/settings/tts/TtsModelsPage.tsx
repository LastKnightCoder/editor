import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { useNavigator } from "../../../router";
import { addTtsModel, deleteTtsModel } from "../../../services/tts-settings";
import { GroupRow } from "../components/ui";
import { ActionButton } from "../storage/fields";
import { TtsPageShell } from "./components/TtsPageShell";
import { TtsCurrentBadge, TtsEmpty, TtsSection, TtsStatus } from "./components/TtsUi";
import { ttsErrorMessage } from "./errors";
import { useTtsDomain } from "./hooks/useTtsDomain";
import { findTtsAccount } from "./model";

export function TtsModelsPage({ instanceId }: { instanceId: string }) {
  const navigator = useNavigator();
  const { setting, usage, database, applySnapshot } = useTtsDomain();
  const account = findTtsAccount(setting, instanceId);
  const [modelId, setModelId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const id = modelId.trim();
    if (!account || !id || busy) return;
    if (account.models.some(model => model.id === id)) {
      setError("模型 ID 在当前账号内不能重复");
      return;
    }
    setBusy("add");
    setError("");
    try {
      const saved = await applySnapshot(() => addTtsModel(database, account.id, { id }));
      if (!saved) return;
      setModelId("");
    } catch (issue) {
      setError(ttsErrorMessage(issue, account.config, "模型添加失败"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!account || busy) return;
    setBusy(id);
    setError("");
    try {
      await applySnapshot(() => deleteTtsModel(database, account.id, id));
    } catch (issue) {
      setError(ttsErrorMessage(issue, account.config, "模型删除失败"));
    } finally {
      setBusy(null);
    }
  };

  if (!account) {
    return (
      <TtsPageShell title="管理模型">
        <TtsEmpty title="账号不存在" description="它可能已被删除，请返回语音设置查看。" />
      </TtsPageShell>
    );
  }

  return (
    <TtsPageShell
      title="管理模型"
      footer={<ActionButton label="完成" emphasis={false} onClick={() => navigator.goBack("ui")} />}
    >
      <div className="page-enter">
        <TtsSection
          label={account.name}
          note="删除当前模型后由原生回落到第一个模型并清空音色；没有剩余模型时清空当前选择。"
        >
          {account.models.map(model => (
            <GroupRow key={model.id}>
              <span className="min-w-0 flex-1">
                <span className="text-ink-1 text-tau-sm block truncate font-mono">{model.id}</span>
                {model.label && <span className="text-ink-3 text-tau-sm block">{model.label}</span>}
              </span>
              {usage?.providerId === account.id && usage.modelId === model.id && (
                <TtsCurrentBadge />
              )}
              <button
                type="button"
                aria-label={`删除模型 ${model.id}`}
                disabled={!!busy}
                className="text-danger grid h-10 w-10 shrink-0 place-items-center disabled:opacity-50"
                onClick={() => void remove(model.id)}
              >
                <Trash2 size={17} aria-hidden="true" />
              </button>
            </GroupRow>
          ))}
          {!account.models.length && (
            <GroupRow>
              <span className="text-ink-3 py-2">暂无模型，请在下方输入模型 ID。</span>
            </GroupRow>
          )}
        </TtsSection>
        {error && (
          <TtsStatus tone="error" title="模型操作失败">
            {error}
          </TtsStatus>
        )}
        <section className="mt-4">
          <form onSubmit={event => void add(event)} className="bg-surface rounded-2xl p-4">
            <label htmlFor="tts-custom-model" className="text-ink-2 text-tau-meta mb-2 block">
              添加自定义模型 ID
            </label>
            <input
              id="tts-custom-model"
              value={modelId}
              onChange={event => setModelId(event.currentTarget.value)}
              className="input-base w-full rounded-xl px-3 font-mono"
              placeholder="输入服务商文档中的模型 ID"
              autoCapitalize="off"
              autoCorrect="off"
            />
            <button
              type="submit"
              disabled={!modelId.trim() || !!busy}
              className="bg-accent text-ink-inverse text-tau-body mt-3 min-h-11 w-full rounded-xl font-semibold disabled:opacity-50"
            >
              {busy === "add" ? "正在添加…" : "添加模型"}
            </button>
            <p className="text-ink-3 text-tau-sm mt-2">
              模型 ID 在当前账号内唯一，预设目录由插件保存时写入。
            </p>
          </form>
        </section>
      </div>
    </TtsPageShell>
  );
}
