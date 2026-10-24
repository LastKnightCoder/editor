import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { TTSVoice } from "@tau/plugins";
import { ActionSheet } from "../../../../components/ActionSheet";
import { BottomSheet } from "../../../../components/BottomSheet";
import { CheckBubble } from "../../../../components/CheckBubble";
import { SearchField } from "../../../../components/SearchField";

export type TtsChoice = {
  id: string;
  label: string;
  description?: string;
};

export function TtsChoiceSheet({
  open,
  title,
  choices,
  selectedId,
  onSelect,
  onClose,
}: {
  open: boolean;
  title: string;
  choices: TtsChoice[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const labelCounts = new Map<string, number>();
  for (const choice of choices) {
    labelCounts.set(choice.label, (labelCounts.get(choice.label) ?? 0) + 1);
  }
  return (
    <ActionSheet
      open={open}
      title={title}
      items={choices.map(choice => ({
        label:
          (labelCounts.get(choice.label) ?? 0) > 1
            ? `${choice.label}（${choice.id}）`
            : choice.label,
        desc: choice.description,
        selected: choice.id === selectedId,
        onClick: () => onSelect(choice.id),
      }))}
      onClose={onClose}
    />
  );
}

const VOICE_TYPE_LABELS = { system: "系统音色", cloned: "我的复刻", custom: "自定义音色" } as const;

export function TtsVoicePicker({
  open,
  voices,
  loading,
  error,
  selectedId,
  onSelect,
  onRefresh,
  onClose,
}: {
  open: boolean;
  voices: TTSVoice[] | undefined;
  loading: boolean;
  error?: string;
  selectedId: string;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [manualId, setManualId] = useState("");
  useEffect(() => {
    if (open) {
      setSearch("");
      setManualId("");
    }
  }, [open]);
  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    return (voices ?? []).filter(voice =>
      keyword
        ? `${voice.name} ${voice.id} ${voice.description ?? ""}`
            .toLocaleLowerCase()
            .includes(keyword)
        : true
    );
  }, [voices, search]);

  return (
    <BottomSheet open={open} title="选择音色" onClose={onClose}>
      <div className="flex items-center gap-2">
        <SearchField
          value={search}
          onValueChange={setSearch}
          placeholder="搜索名称或音色 ID"
          className="min-w-0 flex-1"
        />
        <button
          type="button"
          aria-label="刷新音色列表"
          disabled={loading}
          onClick={onRefresh}
          className="bg-page text-ink-2 grid h-10 w-10 shrink-0 place-items-center rounded-full disabled:opacity-50"
        >
          <RefreshCw size={17} className={loading ? "animate-spin" : ""} aria-hidden="true" />
        </button>
      </div>
      {error && <p className="text-danger text-tau-meta mt-3">{error}</p>}
      {loading && !voices?.length && <p className="text-ink-3 py-5 text-center">正在获取音色…</p>}
      <div className="mt-3 space-y-1">
        {filtered.map(voice => (
          <button
            type="button"
            key={`${voice.type}:${voice.id}`}
            className="active:bg-hover flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left"
            onClick={() => onSelect(voice.id)}
          >
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 text-tau-body block truncate font-medium">
                {voice.name}
              </span>
              <span className="text-ink-3 text-tau-sm block truncate">
                {VOICE_TYPE_LABELS[voice.type]} · {voice.id}
                {voice.description ? ` · ${voice.description}` : ""}
              </span>
            </span>
            {voice.id === selectedId && <CheckBubble />}
          </button>
        ))}
      </div>
      {!loading && !filtered.length && (
        <p className="text-ink-3 text-tau-meta py-4 text-center">
          {search ? "没有匹配的音色，可手动输入 ID" : "暂未获取到音色，可手动输入 ID"}
        </p>
      )}
      <div className="border-line-2 mt-4 border-t pt-4">
        <label htmlFor="tts-manual-voice" className="text-ink-2 text-tau-meta mb-2 block">
          手动输入音色 ID
        </label>
        <input
          id="tts-manual-voice"
          value={manualId}
          onChange={event => setManualId(event.currentTarget.value)}
          className="input-base w-full rounded-xl px-3"
          placeholder="输入服务商文档中的音色 ID"
          autoCapitalize="off"
          autoCorrect="off"
        />
        <button
          type="button"
          disabled={!manualId.trim()}
          onClick={() => onSelect(manualId.trim())}
          className="bg-accent text-ink-inverse text-tau-body mt-2 min-h-11 w-full rounded-xl font-semibold disabled:opacity-50"
        >
          使用此音色 ID
        </button>
      </div>
    </BottomSheet>
  );
}
