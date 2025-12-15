import { useState } from "react";
import { useLocalStorageState } from "ahooks";
import useSettingStore from "@/stores/useSettingStore";
import { ETTSProvider } from "@/types/tts";
import { SpeakerListResult } from "@/types";
import { getAllSpeakerList } from "@/commands";
import { SettingTabs, SettingInput, SettingButton } from "../../components";
import useThemeColors from "@/hooks/useThemeColors";

const PodcastTTSSetting = () => {
  const themeColors = useThemeColors();
  const { podcastTTS, minimaxEnabled, setPodcastTTSProvider, updatePodcastTTSDoubaoConfig } =
    useSettingStore((state) => ({
      podcastTTS: state.setting.integration.podcastTTS,
      minimaxEnabled: state.setting.integration.minimax.enabled,
      setPodcastTTSProvider: state.setPodcastTTSProvider,
      updatePodcastTTSDoubaoConfig: state.updatePodcastTTSDoubaoConfig,
    }));

  const activeProvider = podcastTTS?.active ?? ETTSProvider.Minimax;
  const doubaoConfig = podcastTTS?.doubao ?? {
    accessToken: "",
    secretKey: "",
    appid: "",
    token: "",
  };

  const [checkLoading, setCheckLoading] = useState(false);
  const [speakers, setSpeakers] = useLocalStorageState<SpeakerListResult["Result"]["Statuses"]>(
    "podcast-doubao-tts-speakers",
    {
      defaultValue: [],
    }
  );

  const tabItems = [
    { key: ETTSProvider.Minimax, label: "Minimax" },
    { key: ETTSProvider.Doubao, label: "豆包" },
  ];

  const isDoubaoConfigured =
    doubaoConfig.accessToken && doubaoConfig.secretKey && doubaoConfig.appid && doubaoConfig.token;

  const onCheckDoubao = async () => {
    if (!isDoubaoConfigured) return;
    setCheckLoading(true);
    try {
      const result = await getAllSpeakerList(
        doubaoConfig.accessToken,
        doubaoConfig.secretKey,
        doubaoConfig.appid
      );
      if (!result) return;
      setSpeakers(result?.Result?.Statuses || []);
    } finally {
      setCheckLoading(false);
    }
  };

  const renderMinimaxContent = () => (
    <div className="space-y-4">
      {minimaxEnabled ? (
        <div
          className={`p-4 rounded-lg ${themeColors.inputBgClass} ${themeColors.borderClass} border`}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className={`text-sm font-medium ${themeColors.textClass}`}>Minimax 已连接</span>
          </div>
          <p className={`text-xs ${themeColors.secondaryTextClass}`}>
            Minimax API Key 已在集成设置中配置，可以直接使用播客生成功能。
          </p>
        </div>
      ) : (
        <div
          className={`p-4 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20`}
        >
          <div className="flex items-center gap-2 mb-2">
            <svg
              className="w-4 h-4 text-amber-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
              Minimax 未配置
            </span>
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
            请先在「应用集成」页面配置 Minimax API Key，然后返回此处选择 Minimax 作为播客 TTS
            提供商。
          </p>
          <SettingButton
            variant="secondary"
            onClick={() => {
              useSettingStore.setState({ settingModalOpen: true });
              // 这里可以添加导航到集成设置的逻辑
            }}
          >
            前往配置
          </SettingButton>
        </div>
      )}
    </div>
  );

  const renderDoubaoContent = () => (
    <div className="space-y-4">
      <SettingInput
        label="Access Token"
        type="password"
        value={doubaoConfig.accessToken}
        onChange={(e) => {
          updatePodcastTTSDoubaoConfig({ accessToken: e.target.value });
        }}
        placeholder="请输入 Access Token"
      />

      <SettingInput
        label="Secret Key"
        type="password"
        value={doubaoConfig.secretKey}
        onChange={(e) => {
          updatePodcastTTSDoubaoConfig({ secretKey: e.target.value });
        }}
        placeholder="请输入 Secret Key"
      />

      <SettingInput
        label="Token"
        type="password"
        value={doubaoConfig.token}
        onChange={(e) => {
          updatePodcastTTSDoubaoConfig({ token: e.target.value });
        }}
        placeholder="请输入 Token"
      />

      <SettingInput
        label="App ID"
        value={doubaoConfig.appid}
        onChange={(e) => {
          updatePodcastTTSDoubaoConfig({ appid: e.target.value });
        }}
        placeholder="请输入 App ID"
      />

      <div className="pt-2">
        <SettingButton
          variant="secondary"
          disabled={!isDoubaoConfigured}
          onClick={onCheckDoubao}
          loading={checkLoading}
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        >
          校验凭证
        </SettingButton>
      </div>

      {(speakers || []).length > 0 && isDoubaoConfigured && !checkLoading && (
        <div
          className={`p-3 rounded-lg ${themeColors.inputBgClass} ${themeColors.borderClass} border`}
        >
          <p className={`text-xs ${themeColors.secondaryTextClass} mb-2`}>
            已发现 {speakers?.length || 0} 个发音人
          </p>
          <div className="flex flex-wrap gap-2">
            {(speakers || []).slice(0, 5).map((speaker) => (
              <span
                key={speaker.SpeakerID}
                className="inline-block px-2 py-0.5 text-xs rounded bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300"
              >
                {speaker.Alias || speaker.SpeakerID}
              </span>
            ))}
            {(speakers || []).length > 5 && (
              <span className={`text-xs ${themeColors.secondaryTextClass}`}>
                +{(speakers || []).length - 5} 更多
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    switch (activeProvider) {
      case ETTSProvider.Minimax:
        return renderMinimaxContent();
      case ETTSProvider.Doubao:
        return renderDoubaoContent();
      default:
        return renderMinimaxContent();
    }
  };

  return (
    <div>
      <SettingTabs
        activeKey={activeProvider}
        onChange={(key) => {
          setPodcastTTSProvider(key as ETTSProvider);
        }}
        items={tabItems}
      />

      <div className="mt-6">{renderContent()}</div>
    </div>
  );
};

export default PodcastTTSSetting;
