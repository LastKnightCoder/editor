import { Tabs, TabsProps } from "antd";
import useSettingStore, { ELLMProvider } from "@/stores/useSettingStore.ts";
import OpenAISetting from "./OpenAISetting";
import DoubaoSetting from "./DoubaoSetting";
import { produce } from "immer";

const LLMProviderSetting = () => {
  const { llmProviders } = useSettingStore(state => ({
    llmProviders: state.setting.llmProviders
  }));

  const { currentProvider } = llmProviders;

  const items: TabsProps['items'] = [{
    key: ELLMProvider.OPENAI,
    label: 'Open AI',
    children: <OpenAISetting />,
  }, {
    key: ELLMProvider.DOUBAO,
    label: '豆包',
    children: <DoubaoSetting />,
  }];

  const onCurKeyChange = (key: ELLMProvider) => {
    useSettingStore.setState(produce(draft => {
      draft.setting.llmProviders.currentProvider = key;
    }))
  }

  return (
    <Tabs
      activeKey={currentProvider}
      items={items}
      onChange={(key) => onCurKeyChange(key as ELLMProvider)}
    />
  )
}

export default LLMProviderSetting;
