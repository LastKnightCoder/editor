/**
 * 新建服务商：先选类型——内置目录 or 自定义——再填凭据。
 * 内置项来自 pi 目录（已过滤掉本运行时跑不起来的线协议），选中即带出 name/baseUrl/api/builtin，
 * 用户通常只需填 API Key；网关类服务商目录里没有 baseUrl，仍需自填。
 * 自定义分支暴露 api 下拉——此前新建恒为 openai-completions，界面根本加不了 Anthropic 服务商。
 */

import { llmText, useLlmSettingsI18n } from "../sections/llm.i18n";
import { useMemo, useState } from "react";
import { ArrowLeft, Server, Sparkles } from "lucide-react";
import { Button, Dialog, DialogBody, Input, Select, cn, toast } from "@tau/ui";
import type { LLMProviderSetting, PiApiKind, PiCatalogProvider } from "@/types/pi-llm";
import { useCatalogProviders } from "@/services/llmCatalog";

export const API_KIND_OPTIONS: Array<{ value: PiApiKind; label: string }> = [
  {
    value: "openai-completions",
    get label() {
      return llmText("ui.openaiCompatibleMostCommon");
    },
  },
  {
    value: "openai-responses",
    get label() {
      return llmText("ui.openaiResponsesNewAPI");
    },
  },
  { value: "anthropic-messages", label: "Anthropic（Claude）" },
];

export type NewProviderDraft = Omit<LLMProviderSetting, "id" | "models">;

export function ProviderCreateDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 返回后由调用方补 id/models 并写入设置 */
  onCreate: (draft: NewProviderDraft) => void;
}) {
  useLlmSettingsI18n();

  const { providers: catalog, loading } = useCatalogProviders();
  const [picked, setPicked] = useState<PiCatalogProvider | "custom" | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    name: "",
    baseUrl: "",
    apiKey: "",
    api: "openai-completions" as PiApiKind,
  });

  const reset = () => {
    setPicked(null);
    setQuery("");
    setForm({ name: "", baseUrl: "", apiKey: "", api: "openai-completions" });
  };

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return catalog;
    return catalog.filter(
      item => item.name.toLowerCase().includes(keyword) || item.id.includes(keyword)
    );
  }, [catalog, query]);

  const choose = (item: PiCatalogProvider | "custom") => {
    setPicked(item);
    if (item === "custom") {
      setForm({ name: "", baseUrl: "", apiKey: "", api: "openai-completions" });
      return;
    }
    setForm({ name: item.name, baseUrl: item.baseUrl ?? "", apiKey: "", api: item.api });
  };

  const submit = () => {
    const name = form.name.trim();
    const baseUrl = form.baseUrl.trim();
    if (!name || !baseUrl) {
      toast.warning(llmText("ui.enterANameAndBaseURL"));
      return;
    }
    onCreate({
      name,
      baseUrl,
      apiKey: form.apiKey,
      api: form.api,
      // builtin 让主进程直接命中目录：模型元数据与推理档位都从目录取
      ...(picked && picked !== "custom" ? { builtin: picked.id } : {}),
    });
    onOpenChange(false);
  };

  const isBuiltin = picked !== null && picked !== "custom";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onAfterClose={reset}
      title={llmText("ui.newProvider")}
      subtitle={
        picked === null
          ? llmText("ui.chooseAProvider")
          : isBuiltin
            ? llmText("ui.enterAnAPIKeyToGetStarted")
            : llmText("ui.enterTheServiceAddressManually")
      }
      footer={
        picked === null ? (
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {llmText("ui.cancel")}
          </Button>
        ) : (
          <>
            <Button variant="ghost" icon={ArrowLeft} onClick={() => setPicked(null)}>
              {llmText("ui.back")}
            </Button>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {llmText("ui.cancel")}
            </Button>
            <Button variant="primary" onClick={submit}>
              {llmText("ui.create")}
            </Button>
          </>
        )
      }
    >
      <DialogBody>
        {picked === null ? (
          <div className="flex flex-col gap-2">
            <Input
              value={query}
              placeholder={llmText("ui.searchProviders")}
              aria-label={llmText("ui.searchProviders")}
              onChange={event => setQuery(event.target.value)}
            />
            <button
              type="button"
              onClick={() => choose("custom")}
              className="hover:bg-hover rounded-tau-sm flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors"
            >
              <Server className="text-ink-3 size-4 shrink-0" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">
                <span className="text-tau-body text-ink-1 block font-medium">
                  {llmText("ui.otherProvider")}
                </span>
                <span className="text-tau-meta text-ink-3 block">
                  {llmText("ui.selfHostedServicesOrProvidersOutsideThis")}
                </span>
              </span>
            </button>
            <div className="bg-line h-px" role="separator" />
            {loading ? (
              <div className="text-tau-meta text-ink-3 px-2.5 py-3">{llmText("ui.loading3")}</div>
            ) : filtered.length === 0 ? (
              <div className="text-tau-meta text-ink-3 px-2.5 py-3">
                {catalog.length === 0
                  ? llmText("ui.couldNotLoadProvidersChooseOtherProvider")
                  : llmText("ui.noMatchingProviders")}
              </div>
            ) : (
              <div className="max-h-[320px] overflow-auto">
                {filtered.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => choose(item)}
                    className="hover:bg-hover rounded-tau-sm flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors"
                  >
                    <Sparkles className="text-accent-text size-4 shrink-0" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1">
                      <span className="text-tau-body text-ink-1 block truncate font-medium">
                        {item.name}
                      </span>
                      <span className="text-tau-meta text-ink-3 block truncate">
                        {item.baseUrl ?? llmText("ui.serviceAddressRequired")}
                      </span>
                    </span>
                    <span className="text-tau-tiny text-ink-3 shrink-0 tabular-nums">
                      {item.modelCount} {llmText("ui.models2")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-tau-meta text-ink-2 font-medium">{llmText("ui.name")}</span>
              <Input
                value={form.name}
                placeholder={llmText("ui.forExampleDeepSeek")}
                onChange={event => setForm(f => ({ ...f, name: event.target.value }))}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-tau-meta text-ink-2 font-medium">
                Base URL
                {isBuiltin && !picked.baseUrl && (
                  <span className="text-warn ml-1">
                    {llmText("ui.thisProviderRequiresAnAddress")}
                  </span>
                )}
              </span>
              <Input
                className="font-tau-mono"
                value={form.baseUrl}
                placeholder="https://api.example.com/v1"
                spellCheck={false}
                onChange={event => setForm(f => ({ ...f, baseUrl: event.target.value }))}
              />
            </label>
            {!isBuiltin && (
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-tau-meta text-ink-2 font-medium">
                  {llmText("ui.apiType")}
                </span>
                <Select
                  aria-label={llmText("ui.apiType")}
                  className="w-full"
                  value={form.api}
                  options={API_KIND_OPTIONS}
                  onValueChange={value => setForm(f => ({ ...f, api: value as PiApiKind }))}
                />
              </label>
            )}
            <label className={cn("flex min-w-0 flex-col gap-1.5")}>
              <span className="text-tau-meta text-ink-2 font-medium">
                {llmText("ui.apiKeyCanBeAddedLater")}
              </span>
              <Input
                className="font-tau-mono"
                type="password"
                value={form.apiKey}
                placeholder="sk-…"
                spellCheck={false}
                onChange={event => setForm(f => ({ ...f, apiKey: event.target.value }))}
              />
            </label>
          </div>
        )}
      </DialogBody>
    </Dialog>
  );
}
