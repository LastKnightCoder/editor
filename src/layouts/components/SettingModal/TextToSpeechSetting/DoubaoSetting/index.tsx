import useSettingStore from "@/stores/useSettingStore.ts";
import { useState } from "react";
import { Button, Flex, Input, Select, Space } from "antd";
import { produce } from "immer";
import If from "@/components/If";
import { SpeakerListResult } from "@/types";
import { getAllSpeakerList } from "@/commands";
import { useLocalStorageState } from "ahooks";

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
    <Flex vertical gap={12}>
      <Space>
        <div>accessToken:</div>
        <Input.Password
          value={accessToken}
          onChange={(e) => {
            useSettingStore.setState(
              produce((state) => {
                state.setting.textToSpeech.doubao.accessToken = e.target.value;
              }),
            );
          }}
        />
      </Space>
      <Space>
        <div>secretKey:</div>
        <Input.Password
          value={secretKey}
          onChange={(e) => {
            useSettingStore.setState(
              produce((state) => {
                state.setting.textToSpeech.doubao.secretKey = e.target.value;
              }),
            );
          }}
        />
      </Space>
      <Space>
        <div>token:</div>
        <Input.Password
          value={token}
          onChange={(e) => {
            useSettingStore.setState(
              produce((state) => {
                state.setting.textToSpeech.doubao.token = e.target.value;
              }),
            );
          }}
        />
      </Space>
      <Space>
        <div>appid:</div>
        <Input
          value={appid}
          onChange={(e) => {
            useSettingStore.setState(
              produce((state) => {
                state.setting.textToSpeech.doubao.appid = e.target.value;
              }),
            );
          }}
        />
      </Space>
      <div>
        <Button disabled={disabled} onClick={onCheck} loading={checkLoading}>
          校验
        </Button>
      </div>
      <If condition={(speakers || []).length > 0 && !disabled && !checkLoading}>
        <Space>
          <div>currentSpeakerId:</div>
          <Select
            value={currentSpeakerId}
            options={(speakers || []).map((speaker) => ({
              label: speaker.Alias || speaker.SpeakerID,
              value: speaker.SpeakerID,
            }))}
            onSelect={(value) => {
              useSettingStore.setState(
                produce((state) => {
                  state.setting.textToSpeech.doubao.currentSpeakerId = value;
                }),
              );
            }}
          />
        </Space>
      </If>
    </Flex>
  );
};

export default DoubaoSetting;
