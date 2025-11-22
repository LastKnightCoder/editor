/** @type {import('tailwindcss').Config} */
export default {
  content: [],
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
        // ==================== 统一颜色系统 ====================
        // 背景色
        "bg-page": "var(--color-bg-page)",
        "bg-container": "var(--color-bg-container)",
        "bg-elevated": "var(--color-bg-elevated)",
        "bg-canvas": "var(--color-bg-canvas)",
        "bg-input": "var(--color-bg-input)",
        
        // 文字色
        "text-1": "var(--color-text-primary)",
        "text-2": "var(--color-text-secondary)",
        "text-3": "var(--color-text-tertiary)",
        "text-4": "var(--color-text-quaternary)",
        
        // 边框色
        "border-1": "var(--color-border-primary)",
        "border-2": "var(--color-border-secondary)",
        
        // 品牌色（蓝色系）
        "brand": "var(--color-primary)",
        "brand-hover": "var(--color-primary-hover)",
        "brand-active": "var(--color-primary-active)",
        
        // 语义色
        "status-success": "var(--color-success)",
        "status-warning": "var(--color-warning)",
        "status-error": "var(--color-error)",
        "status-info": "var(--color-info)",
        
        // 标签色
        "tag-bg": "var(--color-tag-bg)",
        "tag-text": "var(--color-tag-text)",
        
        // 遮罩
        mask: "var(--color-mask)",
        
        // ==================== 原有颜色（保持兼容）====================
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
