/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx}", "./profile/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      spacing: {
        15: "60px",
        75: "300px",
      },
      width: {
        75: "300px",
      },
      colors: {
        // 基础背景/文本/线条
        "primary-bg": "var(--primary-bg-color)",
        surface: "var(--main-bg-color)",
        line: "var(--line-color)",
        "text-normal": "var(--text-normal)",
        code: "var(--code-normal)",
        "code-bg": "var(--code-bg)",

        // 面板/表格/卡片
        "panel-active": "var(--block-panel-active-bg)",
        hover: "var(--common-hover-bg)",
        "item-hover": "var(--item-common-hover-bg)",
        divider: "var(--table-border-color)",
        "table-odd": "var(--table-odd-bg)",
        "card-bg": "var(--card-bg-color)",
        "card-line": "var(--card-line-color)",

        // 主题强调
        "bottom-line": "var(--bottom-line-bg)",
        "tab-active": "var(--tab-active-color)",
        selection: "var(--selection-color)",

        // 滚动条
        "scroll-track": "var(--scroller-track-background-color)",
        "scroll-thumb": "var(--scroller-thumb-background-color)",

        // 常规状态
        "normal-card": "var(--normal-card-bg)",
        "normal-icon": "var(--normal-icon-bg)",
        active: "var(--active-bg-color)",
        "active-text": "var(--active-text-color)",
        "active-icon": "var(--active-icon-bg)",

        // 子弹列表
        "bullet-bg": "var(--bullet-list-item-bg)",

        // 侧栏/分栏
        sidebar: "var(--sidebar-background)",
        "sidebar-active": "var(--sidebar-active-bg)",
        "sidebar-2nd": "var(--second-sidevar-background)",

        // FrontMatter（现有注释）
        "bg-secondary": "var(--bg-secondary)",
        "bg-tertiary": "var(--bg-tertiary)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        // UI 辅助
        "ui-border": "var(--ui-border)",
        "ui-outline": "var(--ui-outline)",
      },
      boxShadow: {
        1: "var(--box-shadow1)",
        2: "var(--box-shadow2)",
        layer: "var(--shadow)",
      },
    },
  },
};
