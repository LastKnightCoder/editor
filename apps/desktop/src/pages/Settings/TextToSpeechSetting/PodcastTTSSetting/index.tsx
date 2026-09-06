import useSettingStore from "@/stores/useSettingStore";
import { SettingButton, SettingDropdown } from "../../components";
import useThemeColors from "@/hooks/useThemeColors";
import { MINIMAX_SPEECH_MODELS } from "@/utils/tts/minimaxSpeech";

const PodcastTTSSetting = () => {
  const themeColors = useThemeColors();
  const { podcastTTS, minimaxEnabled, setPodcastTTSMinimaxModel } = useSettingStore(state => ({
    podcastTTS: state.setting.integration.podcastTTS,
    minimaxEnabled: state.setting.integration.minimax.enabled,
    setPodcastTTSMinimaxModel: state.setPodcastTTSMinimaxModel,
  }));

  const minimaxModel = podcastTTS.minimaxModel;
  const minimaxModelOptions = MINIMAX_SPEECH_MODELS.map(model => ({
    label: model,
    value: model,
  }));

  const renderMinimaxContent = () => (
    <div className="space-y-4">
      <SettingDropdown
        label="语音模型"
        value={minimaxModel}
        onChange={value => {
          setPodcastTTSMinimaxModel(value as (typeof MINIMAX_SPEECH_MODELS)[number]);
        }}
        options={minimaxModelOptions}
      />

      {minimaxEnabled ? (
        <div
          className={`rounded-lg p-4 ${themeColors.inputBgClass} ${themeColors.borderClass} border`}
        >
          <div className="mb-2 flex items-center gap-2">
            <div className="bg-status-success h-2 w-2 rounded-full" />
            <span className={`text-sm font-medium ${themeColors.textClass}`}>Minimax 已连接</span>
          </div>
          <p className={`text-xs ${themeColors.secondaryTextClass}`}>
            Minimax API Key 已在集成设置中配置，可以直接使用播客生成功能。
          </p>
        </div>
      ) : (
        <div
          className={`rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20`}
        >
          <div className="mb-2 flex items-center gap-2">
            <svg
              className="h-4 w-4 text-amber-500"
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
          <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
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

  return <div>{renderMinimaxContent()}</div>;
};

export default PodcastTTSSetting;
