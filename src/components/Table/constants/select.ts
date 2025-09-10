export const SELECT_COLORS_CONFIG = {
  red: {
    light: {
      backgroundColor: "rgba(204, 1, 88, 0.137)",
      color: "rgb(109, 53, 49)",
    },
    dark: {
      backgroundColor: "#8B0000",
      color: "#fff",
    },
  },
  orange: {
    light: {
      backgroundColor: "rgba(213, 96, 0, 0.19)",
      color: "rgb(101, 61, 33)",
    },
    dark: {
      backgroundColor: "#8B0000",
      color: "#fff",
    },
  },
  yellow: {
    light: {
      backgroundColor: "rgba(209, 155, 0, 0.24)",
      color: "rgb(93, 66, 34)",
    },
    dark: {
      backgroundColor: "rgba(255, 182, 135, 0.275)",
      color: "rgb(245, 237, 233)",
    },
  },
  green: {
    light: {
      backgroundColor: "rgba(1, 104, 42, 0.145)",
      color: "rgb(42, 83, 60)",
    },
    dark: {
      backgroundColor: "rgba(93, 255, 164, 0.25)",
      color: "rgb(232, 241, 236)",
    },
  },
  gray: {
    light: {
      backgroundColor: "rgba(28, 19, 1, 0.11)",
      color: "rgb(73, 72, 70)",
    },
    dark: {
      backgroundColor: "rgba(254, 250, 240, 0.208)",
      color: "rgb(230, 229, 227)",
    },
  },
  blue: {
    light: {
      backgroundColor: "rgba(45, 149, 218, 0.235)",
      color: "rgb(38, 74, 114)",
    },
    dark: {
      backgroundColor: "rgba(59, 152, 255, 0.384)",
      color: "rgb(232, 242, 250)",
    },
  },
  purple: {
    light: {
      backgroundColor: "rgba(104, 1, 184, 0.125)",
      color: "rgb(85, 59, 105)",
    },
    dark: {
      backgroundColor: "rgba(197, 123, 255, 0.345)",
      color: "rgb(243, 235, 249)",
    },
  },
};

export const SELECT_COLORS = Object.keys(SELECT_COLORS_CONFIG) as Array<
  keyof typeof SELECT_COLORS_CONFIG
>;
