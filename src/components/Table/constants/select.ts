// 单选或多选标签的背景色和文字颜色，红橙黄绿青蓝紫都有
// 包含浅色和深色
export const SELECT_COLORS_CONFIG = {
  red: {
    light: {
      backgroundColor: "#FF4500",
      color: "#fff",
    },
    dark: {
      backgroundColor: "#8B0000",
      color: "#fff",
    },
  },
  orange: {
    light: {
      backgroundColor: "#FFA500",
      color: "#fff",
    },
    dark: {
      backgroundColor: "#8B0000",
      color: "#fff",
    },
  },
  yellow: {
    light: {
      backgroundColor: "#FFFF00",
      color: "#000",
    },
    dark: {
      backgroundColor: "#8B8B00",
      color: "#fff",
    },
  },
  green: {
    light: {
      backgroundColor: "#90EE90",
      color: "#000",
    },
    dark: {
      backgroundColor: "#006400",
      color: "#fff",
    },
  },
  cyan: {
    light: {
      backgroundColor: "#00FFFF",
      color: "#000",
    },
    dark: {
      backgroundColor: "#000080",
      color: "#fff",
    },
  },
  blue: {
    light: {
      backgroundColor: "#1E90FF",
      color: "#fff",
    },
    dark: {
      backgroundColor: "#000080",
      color: "#fff",
    },
  },
  purple: {
    light: {
      backgroundColor: "#800080",
      color: "#fff",
    },
    dark: {
      backgroundColor: "#800080",
      color: "#fff",
    },
  },
};

export const SELECT_COLORS = Object.keys(SELECT_COLORS_CONFIG) as Array<
  keyof typeof SELECT_COLORS_CONFIG
>;
