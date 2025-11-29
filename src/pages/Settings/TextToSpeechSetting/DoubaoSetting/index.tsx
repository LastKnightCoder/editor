import useSettingStore from "@/stores/useSettingStore";
import { useState } from "react";
import { produce } from "immer";
import { SpeakerListResult } from "@/types";
import { getAllSpeakerList } from "@/commands";
import { useLocalStorageState } from "ahooks";
import { SettingInput, SettingDropdown, SettingButton } from "../../components";

const DoubaoSetting = () => {
  const { setting } = useSettingStore((state) => ({
    setting: state.setting.textToSpeech.doubao,
  }));

  const { appid, accessToken, secretKey, token, currentSpeakerId } = setting;

  const [checkLoading, setCheckLoading] = useState(false);
  const [speakers, setSpeakers] = useLocalStorageState<
    SpeakerListResult["Result"]["Statuses"]
  >("doubao-tts-speakers", {
    defaultValue: [],
  });

  const disabled = !accessToken || !secretKey || !token || !appid;

  const onCheck = async () => {
    if (!accessToken || !secretKey || !token || !appid) return;
    setCheckLoading(true);
    try {
      const result = await getAllSpeakerList(accessToken, secretKey, appid);
      if (!result) return;
      setSpeakers(result?.Result?.Statuses || []);
    } finally {
      setCheckLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <SettingInput
        label="Access Token"
        type="password"
        value={accessToken}
        onChange={(e) => {
          useSettingStore.setState(
            produce((state) => {
              state.setting.textToSpeech.doubao.accessToken = e.target.value;
            }),
          );
        }}
        placeholder="请输入 Access Token"
      />

      <SettingInput
        label="Secret Key"
        type="password"
        value={secretKey}
        onChange={(e) => {
          useSettingStore.setState(
            produce((state) => {
              state.setting.textToSpeech.doubao.secretKey = e.target.value;
            }),
          );
        }}
        placeholder="请输入 Secret Key"
      />

      <SettingInput
        label="Token"
        type="password"
        value={token}
        onChange={(e) => {
          useSettingStore.setState(
            produce((state) => {
              state.setting.textToSpeech.doubao.token = e.target.value;
            }),
          );
        }}
        placeholder="请输入 Token"
      />

      <SettingInput
        label="App ID"
        value={appid}
        onChange={(e) => {
          useSettingStore.setState(
            produce((state) => {
              state.setting.textToSpeech.doubao.appid = e.target.value;
            }),
          );
        }}
        placeholder="请输入 App ID"
      />

      <div className="pt-2">
        <SettingButton
          variant="secondary"
          disabled={disabled}
          onClick={onCheck}
          loading={checkLoading}
          icon={
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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

      {(speakers || []).length > 0 && !disabled && !checkLoading && (
        <SettingDropdown
          label="发音人"
          value={currentSpeakerId}
          onChange={(value) => {
            useSettingStore.setState(
              produce((state) => {
                state.setting.textToSpeech.doubao.currentSpeakerId = value;
              }),
            );
          }}
          options={(speakers || []).map((speaker) => ({
            label: speaker.Alias || speaker.SpeakerID,
            value: speaker.SpeakerID,
          }))}
        />
      )}
    </div>
  );
};

export default DoubaoSetting;
