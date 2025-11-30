import { invoke } from "@/electron";
import {
  SetWebViewPreferencePayload,
  WebViewPreference,
} from "@/types/web-view-preference";

export const getWebViewPreference = async (
  projectItemId: number,
): Promise<WebViewPreference | null> => {
  return await invoke("web-view-preference:get", projectItemId);
};

export const setWebViewPreference = async (
  payload: SetWebViewPreferencePayload,
): Promise<WebViewPreference> => {
  return await invoke("web-view-preference:set", payload);
};
