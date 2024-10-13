import { produce } from 'immer';
import { Switch } from "antd";
import useSettingStore from "@/stores/useSettingStore.ts";
import For from "@/components/For";

import styles from './index.module.less';

const ModuleSetting = () => {
  const { module, setting } = useSettingStore(state => ({
    module: state.setting.module,
    setting: state.setting,
  }));

  const modules = Object.keys(module).map(key => ({
    key,
    name: module[key as keyof typeof module].name,
    enable: module[key as keyof typeof module].enable,
  }));

  const onModuleChange = (checked: boolean, key: string) => {
    const newSetting = produce(setting, draft => {
      draft.module[key as keyof typeof module].enable = checked;
    });
    useSettingStore.setState({ setting: newSetting });
  }

  return (
    <div className={styles.moduleList}>
      <For
        data={modules}
        renderItem={module => (
          <div key={module.key} className={styles.item}>
            <div>{module.name}</div>
            <Switch checked={module.enable} onChange={checked => onModuleChange(checked, module.key)} />
          </div>
        )}
      />
    </div>
  )
}

export default ModuleSetting;