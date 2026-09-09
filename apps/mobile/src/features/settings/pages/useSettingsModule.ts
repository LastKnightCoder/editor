// 设置页二级模块栈：跟随 settings 页面实例的生命周期，返回键优先退子模块。

import { useCallback, useState } from "react";
import type { SettingModule } from "../components/types";
import { useBackHandler } from "../../../router";

export function useSettingsModule(): {
  activeModule: SettingModule;
  onActiveModuleChange: (module: SettingModule | null) => void;
} {
  const [activeModule, setActiveModule] = useState<SettingModule>(null);

  useBackHandler(
    useCallback(() => {
      if (activeModule === null) {
        return false;
      }
      setActiveModule(null);
      return true;
    }, [activeModule])
  );

  return {
    activeModule,
    onActiveModuleChange: module => {
      setActiveModule(module);
    },
  };
}
