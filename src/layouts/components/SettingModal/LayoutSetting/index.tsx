import { Select } from "antd";
import { useNavigate } from 'react-router-dom';
import useSettingStore, { ELayout } from "@/stores/useSettingStore.ts";
import { produce } from "immer";

const LayoutSetting = () => {
  const navigate = useNavigate();

  const {
    layout
  } = useSettingStore(state => ({
    layout: state.setting.layout
  }));

  const onSelectChange = (value: ELayout) => {
    if (value !== layout) {
      useSettingStore.setState(produce(state => {
        state.setting.layout = value;
        state.settingModalOpen = false;
      }));
      if (value === ELayout.ShortSidebar) {
        navigate('/cards/list');
      } else {
        navigate('/')
      }
    }
  }

  return (
    <Select
      value={layout}
      options={[{
        label: '三列布局',
        value: ELayout.ThreeColumn
      }, {
        label: '紧凑布局',
        value: ELayout.ShortSidebar
      }]}
      onSelect={onSelectChange}
    />
  )
}

export default LayoutSetting;
