import { invoke } from "@/electron";
import { withModule } from "./module-init";
import type { BrowserCompanionSnapshot, PairPrompt } from "@/types/browser-companion";
import type { CompanionScope } from "@tau/shared/browser-companion";
import type { ChatSessionMessage } from "@tau/shared/chat-core";

const request = <T>(channel: string, ...args: unknown[]) =>
  withModule("browser-companion", () => invoke<T>(channel, ...args));

export const getBrowserCompanionSnapshot = () =>
  request<BrowserCompanionSnapshot>("browser-companion:snapshot");

export const getPendingPairPrompts = () =>
  request<PairPrompt[]>("browser-companion:pending-prompts");

export const decidePairPrompt = (requestId: string, allow: boolean, scopes: CompanionScope[]) =>
  request<void>("browser-companion:pair-decide", requestId, allow, scopes);

export const setBrowserClientScopes = (clientId: string, scopes: CompanionScope[]) =>
  request<void>("browser-companion:set-scopes", clientId, scopes);

export const revokeBrowserClient = (clientId: string) =>
  request<void>("browser-companion:revoke", clientId);

export const setAcceptNewBrowserClients = (accept: boolean) =>
  request<void>("browser-companion:set-accept-new", accept);

export interface BrowserChatTranscript {
  title: string;
  updateTime: number;
  messages: ChatSessionMessage[];
}

/** 某个网页上的一段伴读对话（只读）；不存在返回 null */
export const getBrowserChatTranscript = (url: string, session: string) =>
  request<BrowserChatTranscript | null>("browser-companion:transcript", { url, session });
