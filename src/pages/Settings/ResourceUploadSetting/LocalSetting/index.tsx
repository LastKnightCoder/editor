import useSettingStore from "@/stores/useSettingStore";

const LocalSetting = () => {
  const { local } = useSettingStore((state) => ({
    local: state.setting.imageBed.local,
  }));

  const { path } = local;

  return <div>{path}</div>;
};

export default LocalSetting;
