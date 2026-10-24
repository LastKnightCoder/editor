import { useQuery } from "@tanstack/react-query";
import { withMobilePluginTTS } from "../../../../services/plugin-tts";
import type { TTSProviderSetting } from "../../../../types";
import { useTtsDomain } from "./useTtsDomain";

export function useTtsVoices(
  account: TTSProviderSetting | undefined,
  modelId: string,
  enabled = true
) {
  const { runtime, providerFor } = useTtsDomain();
  const available = !!account && !!providerFor(account.pluginId) && !!runtime && !!modelId;
  return useQuery({
    queryKey: ["tts", "voices", runtime?.workspaceId ?? "", account?.id ?? "", modelId],
    enabled: enabled && available,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      if (!runtime || !account || !modelId) throw new Error("语音服务不可用");
      return withMobilePluginTTS(
        runtime,
        { pluginId: account.pluginId, config: account.config, modelId },
        async session => ({ info: session.info, voices: await session.voices(signal) }),
        signal
      );
    },
  });
}

export function useTtsSessionInfo(
  account: TTSProviderSetting | undefined,
  modelId: string,
  enabled = true
) {
  const { runtime, providerFor } = useTtsDomain();
  const available = !!account && !!providerFor(account.pluginId) && !!runtime && !!modelId;
  return useQuery({
    queryKey: ["tts", "session", runtime?.workspaceId ?? "", account?.id ?? "", modelId],
    enabled: enabled && available,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      if (!runtime || !account || !modelId) throw new Error("语音服务不可用");
      return withMobilePluginTTS(
        runtime,
        { pluginId: account.pluginId, config: account.config, modelId },
        session => session.info,
        signal
      );
    },
  });
}
