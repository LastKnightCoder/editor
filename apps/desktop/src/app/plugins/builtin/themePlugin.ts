import { definePlugin } from "@tau/plugins";
import { listThemes } from "@tau/themes";
import { nextAppearance, useThemeStore } from "@tau/themes/react";

export const themePlugin = definePlugin({
  id: "core.theme",
  name: "主题切换",
  version: "1.0.0",
  create: () => ({
    activate(context) {
      context.commands.register({
        id: "next-theme",
        title: "切换到下一个主题",
        run() {
          const themes = listThemes();
          const state = useThemeStore.getState();
          const index = themes.findIndex(theme => theme.key === state.theme);
          const next = themes[(index + 1) % themes.length];
          if (!next) throw new Error("当前没有可用主题");
          state.setTheme(next.key);
          return next.key;
        },
      });
      context.commands.register({
        id: "cycle-appearance",
        title: "切换明暗模式：浅色、深色、跟随系统",
        run() {
          const state = useThemeStore.getState();
          const appearance = nextAppearance(state.appearance);
          state.setAppearance(appearance);
          return appearance;
        },
      });
    },
  }),
});
