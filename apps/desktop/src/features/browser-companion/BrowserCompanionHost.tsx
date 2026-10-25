import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { create } from "zustand";
import { Button, Dialog, DialogBody, Switch } from "@tau/ui";
import { useThemeStore } from "@tau/themes/react";
import { REQUIRED_SCOPES, type CompanionScope } from "@tau/shared/browser-companion";
import { off, on, send } from "@/electron";
import { decidePairPrompt, getPendingPairPrompts } from "@/commands/browser-companion";
import { showAndFocusWindow } from "@/commands/window";
import { openContent } from "@/services/open-content";
import { openPage } from "@/services/page-navigation";
import { installBrowserBridgeRenderer } from "@/services/browserBridgeRenderer";
import type { PairPrompt } from "@/types/browser-companion";
import { SCOPE_LABELS, clientLabel } from "./labels";

const usePairPrompts = create<{ prompts: PairPrompt[] }>()(() => ({ prompts: [] }));

const addPrompt = (prompt: PairPrompt) =>
  usePairPrompts.setState(state =>
    state.prompts.some(item => item.requestId === prompt.requestId)
      ? state
      : { prompts: [...state.prompts, prompt] }
  );

const removePrompt = (requestId: string) =>
  usePairPrompts.setState(state => ({
    prompts: state.prompts.filter(item => item.requestId !== requestId),
  }));

/**
 * 浏览器伴读在主窗口里的宿主（壳层挂载）：
 * - 扩展首次连接的授权弹窗，一次显示队首请求；关闭与 Esc 等同拒绝；
 * - 把当前主题族与明暗上报主进程，扩展跟随；
 * - 扩展里点「在 Tau 中打开 / 查看」时打开对应卡片或网页对话页。
 */
export function BrowserCompanionHost() {
  useEffect(() => {
    installBrowserBridgeRenderer();
    const onPrompt = (_event: unknown, prompt: PairPrompt) => addPrompt(prompt);
    const onClosed = (_event: unknown, requestId: string) => removePrompt(requestId);
    const onOpenCard = (_event: unknown, cardId: number) => {
      void showAndFocusWindow().then(() => openContent("card", cardId));
    };
    on("browser-companion:pair-prompt", onPrompt);
    on("browser-companion:pair-closed", onClosed);
    const onOpenChat = (_event: unknown, target: { url: string; session: string }) => {
      void showAndFocusWindow().then(() => openPage("browser-chat", target));
    };
    on("browser-companion:open-card", onOpenCard);
    on("browser-companion:open-chat", onOpenChat);
    // 窗口重载期间到达的请求从主进程补拉
    void getPendingPairPrompts()
      .then(prompts => prompts.forEach(addPrompt))
      .catch(() => {});
    return () => {
      off("browser-companion:pair-prompt", onPrompt);
      off("browser-companion:pair-closed", onClosed);
      off("browser-companion:open-card", onOpenCard);
      off("browser-companion:open-chat", onOpenChat);
    };
  }, []);

  const theme = useThemeStore(state => state.theme);
  const mode = useThemeStore(state => state.mode);
  useEffect(() => {
    send("browser-companion:appearance", { theme, mode });
  }, [theme, mode]);

  const prompt = usePairPrompts(state => state.prompts[0]);
  return <PairingDialog key={prompt?.requestId} prompt={prompt} />;
}

function PairingDialog({ prompt }: { prompt: PairPrompt | undefined }) {
  const [tools, setTools] = useState(true);
  const decide = (allow: boolean) => {
    if (!prompt) return;
    removePrompt(prompt.requestId);
    const scopes: CompanionScope[] = [...REQUIRED_SCOPES, ...(tools ? (["tools"] as const) : [])];
    void decidePairPrompt(prompt.requestId, allow, scopes);
  };
  return (
    <Dialog
      open={Boolean(prompt)}
      onOpenChange={open => {
        if (!open) decide(false);
      }}
      title={prompt ? `${prompt.info.browser} 想连接到 Tau` : "浏览器扩展请求连接"}
      icon={<Globe size={16} strokeWidth={1.75} />}
      subtitle="来自「Tau 伴读」浏览器扩展"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={() => decide(false)}>
            拒绝
          </Button>
          <Button variant="primary" onClick={() => decide(true)}>
            允许连接
          </Button>
        </>
      }
    >
      {prompt && (
        <DialogBody className="text-tau-body text-ink-2">
          <dl className="text-tau-meta mb-4 grid grid-cols-[64px_1fr] gap-x-3 gap-y-1.5">
            <dt className="text-ink-3">浏览器</dt>
            <dd className="text-ink-1">{clientLabel(prompt.info)}</dd>
            <dt className="text-ink-3">扩展</dt>
            <dd className="text-ink-1 min-w-0">
              Tau 伴读 {prompt.info.version}
              <span className="text-tau-tiny text-ink-3 ml-1.5 font-mono break-all">
                {prompt.origin}
              </span>
            </dd>
          </dl>
          <div className="border-line-1 rounded-tau-md mb-4 flex items-center gap-3.5 border px-3.5 py-3">
            <div className="flex gap-1.5" aria-label={`校验码 ${prompt.code}`}>
              {prompt.code.split("").map((digit, index) => (
                <span
                  key={index}
                  className="border-line-1 text-tau-title-lg text-ink-1 grid h-11 w-9 place-items-center rounded-[10px] border font-mono font-semibold"
                >
                  {digit}
                </span>
              ))}
            </div>
            <p className="text-tau-meta">与浏览器面板里显示的校验码一致吗？不一致请拒绝。</p>
          </div>
          <p className="text-tau-meta text-ink-3 mb-1">允许它</p>
          <ul className="flex flex-col">
            {REQUIRED_SCOPES.map(scope => (
              <li key={scope} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-ink-1 font-medium">{SCOPE_LABELS[scope].label}</div>
                  <div className="text-tau-meta text-ink-3">{SCOPE_LABELS[scope].detail}</div>
                </div>
                <span className="text-tau-sm text-ink-3">必需</span>
              </li>
            ))}
            <li className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-ink-1 font-medium">{SCOPE_LABELS.tools.label}</div>
                <div className="text-tau-meta text-ink-3">{SCOPE_LABELS.tools.detail}</div>
              </div>
              <Switch
                aria-label={SCOPE_LABELS.tools.label}
                checked={tools}
                onCheckedChange={setTools}
              />
            </li>
          </ul>
          <p className="text-tau-meta text-ink-3 mt-3">
            允许后长期有效，可在 设置 › 浏览器扩展 调整权限或撤销。
          </p>
        </DialogBody>
      )}
    </Dialog>
  );
}
