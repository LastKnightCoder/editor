import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { resolveExtensionLocale } from "./locale";
import type { ConnectionStatus } from "./messages";
let status: ConnectionStatus = { state: "unpaired" };
export const extensionLocaleSource = createLocaleStore(resolveExtensionLocale(status));
export const extensionI18n = createI18nRuntime({ localeSource: extensionLocaleSource });
export function updateExtensionLocale(next: ConnectionStatus) {
  status = next;
  extensionLocaleSource.setLocale(resolveExtensionLocale(next));
}
/** 调用方显式传入其拥有的元素；内容脚本不得传第三方 documentElement。 */
export function bindExtensionLanguage(element: HTMLElement): () => void {
  const apply = () => {
    element.lang = extensionLocaleSource.getSnapshot();
  };
  apply();
  const unsubscribe = extensionLocaleSource.subscribe(apply);
  const browserChanged = () => updateExtensionLocale(status);
  window.addEventListener("languagechange", browserChanged);
  return () => {
    unsubscribe();
    window.removeEventListener("languagechange", browserChanged);
  };
}
