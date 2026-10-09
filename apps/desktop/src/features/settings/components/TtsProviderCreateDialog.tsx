/**
 * 新建 TTS 服务商：先选内置预设（百炼 / Minimax），再填 API Key。
 * 预设带出 baseUrl 与模型候选（catalog.ts），比 LLM 的 pi 目录简单——
 * TTS 服务商就两家，不做自定义分支；模型本身支持手动添加任意 id。
 */
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button, Dialog, DialogBody, toast } from "@tau/ui";
import type { TTSProviderSetting } from "@/types/tts";
import {
  TTS_PROVIDER_PRESETS,
  createProviderFromPreset,
  type TTSProviderPreset,
} from "@/utils/tts/catalog";
import { SecretInput } from "./ProviderLayout";

export function TtsProviderCreateDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 返回后由调用方补 id 并写入设置 */
  onCreate: (draft: Omit<TTSProviderSetting, "id">) => void;
}) {
  const [picked, setPicked] = useState<TTSProviderPreset | null>(null);
  const [apiKey, setApiKey] = useState("");

  // 打开即重置：不依赖退场动画后的 onAfterClose，避免关闭后快速重开时残留草稿
  useEffect(() => {
    if (open) {
      setPicked(null);
      setApiKey("");
    }
  }, [open]);

  const reset = () => {
    setPicked(null);
    setApiKey("");
  };

  const submit = () => {
    if (!picked) return;
    if (!apiKey.trim()) {
      toast.warning("请填写 API Key");
      return;
    }
    onCreate({ ...createProviderFromPreset(picked), apiKey: apiKey.trim() });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onAfterClose={reset}
      title="新建语音合成服务商"
      subtitle={picked ? "填入 API Key 即可使用" : "选择要接入的服务商"}
      footer={
        picked ? (
          <>
            <Button variant="ghost" icon={ArrowLeft} onClick={() => setPicked(null)}>
              返回
            </Button>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={submit}>
              创建
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
        )
      }
    >
      <DialogBody>
        {picked === null ? (
          <div className="flex flex-col gap-2">
            {TTS_PROVIDER_PRESETS.map(preset => (
              <button
                key={preset.providerType}
                type="button"
                onClick={() => setPicked(preset)}
                className="border-line-1 hover:bg-hover rounded-tau-sm border p-3 text-left transition-colors"
              >
                <div className="text-tau-body-lg text-ink-1 font-medium">{preset.name}</div>
                <div className="text-tau-meta text-ink-2 mt-0.5">{preset.description}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="border-line-1 text-tau-meta text-ink-2 rounded-tau-sm flex items-center justify-between border px-3 py-2">
              <span>{picked.name}</span>
              <span className="font-tau-mono">{picked.models[0]?.id}</span>
            </div>
            <SecretInput
              label="API Key"
              value={apiKey}
              placeholder={
                picked.providerType === "qwen"
                  ? "sk-…（百炼 DASHSCOPE_API_KEY）"
                  : "eyJ…（Minimax API Key）"
              }
              onChange={setApiKey}
            />
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
}
