export const VISUALIZE_READ_ME_TOOL_NAME = "visualize_read_me";
export const SHOW_WIDGET_TOOL_NAME = "show_widget";
export const GENERATIVE_WIDGET_RENDERER_KEY = "generative-widget";

export const GENERATIVE_UI_AVAILABLE_MODULES = [
  "interactive",
  "chart",
  "diagram",
  "mockup",
  "art",
  "design",
] as const;

export type GenerativeUiModule =
  (typeof GENERATIVE_UI_AVAILABLE_MODULES)[number];

export const DEFAULT_WIDGET_LOADING_MESSAGES = [
  "正在生成界面...",
  "正在组织布局...",
  "正在补充交互...",
];

export const GENERATIVE_UI_SYSTEM_PROMPT = `
## 生成式 UI 工具规则

当用户明确要求“展示 / 可视化 / 做一个交互界面 / 画图说明 / 做一个图表面板”时，可以优先使用生成式 UI 工具。

使用规则：
1. 首次调用 \`${SHOW_WIDGET_TOOL_NAME}\` 前，必须先调用 \`${VISUALIZE_READ_ME_TOOL_NAME}\`，按需求选择最贴近的 modules。
2. \`${SHOW_WIDGET_TOOL_NAME}\` 的 \`widget_code\` 必须是 HTML/SVG 片段，禁止输出 \`<!DOCTYPE>\`、\`<html>\`、\`<head>\`、\`<body>\`。
3. \`widget_code\` 必须放在参数对象最后，\`<script>\` 必须写在 HTML 最后。
4. 解释性正文写在普通 assistant 文本中，不要把长段说明塞进 widget 内部。
5. widget 内若需要继续驱动对话，请调用 \`window.tauWidget.sendPrompt(text)\`，不要假设可直接访问宿主或本地文件系统。
6. 能用普通文字回答时，不要滥用 widget；只有视觉化能明显提升体验时再调用。
7. widget 内的按钮、图例、标签、说明文本默认跟随用户当前提问语言；除非用户明确要求英文或双语，否则不要因为 guideline 是英文就输出英文界面。
8. 对于 TCP、ACK、HTTP、API 等约定俗成的协议名/缩写，可保留英文术语，但周围解释文字和控件文案仍应跟随用户语言。

## 主题适配规则

生成 widget 时必须同时适配浅色和深色模式，并跟随宿主主题变化。

要求：
- 文本、背景、边框、按钮、输入框、面板优先使用宿主提供的 CSS 变量，不要默认写死只适配单一主题的颜色。
- 除非用户明确要求固定视觉风格，否则不要把最外层容器写成固定纯白背景或固定纯深色背景。
- 若必须使用自定义颜色，请确保它在浅色和深色模式下都保持可读，并为文本、背景、边框提供完整的主题适配。
- 当宿主主题切换时，widget 应通过 CSS 变量自然跟随，不要假设当前永远是浅色或深色。
- 最终输出前请自检：如果背景切换为浅色或深色，标题、正文、控件、边框、图例、坐标轴和强调色是否仍然清晰可读。

优先使用以下主题 token：
- \`--color-background-primary\`
- \`--color-background-secondary\`
- \`--color-background-tertiary\`
- \`--color-background-info\`
- \`--color-background-danger\`
- \`--color-background-success\`
- \`--color-background-warning\`
- \`--color-text-primary\`
- \`--color-text-secondary\`
- \`--color-text-tertiary\`
- \`--color-text-info\`
- \`--color-text-danger\`
- \`--color-text-success\`
- \`--color-text-warning\`
- \`--color-border-primary\`
- \`--color-border-secondary\`
- \`--color-border-tertiary\`
- \`--color-border-info\`
- \`--color-border-danger\`
- \`--color-border-success\`
- \`--color-border-warning\`
- \`--font-sans\`
- \`--font-serif\`
- \`--font-mono\`
- \`--border-radius-md\`
- \`--border-radius-lg\`
- \`--border-radius-xl\`

明确避免：
- 避免直接把正文文本写成固定 \`#111\` / \`#222\` / \`#333\` / \`black\`
- 避免直接把面板背景写成固定 \`#fff\` / \`white\`
- 避免默认只写一套 dark-only 或 light-only 配色
- 避免依赖初始化脚本去判断当前主题后再生成完全不同的 DOM 结构
- 避免在图表、SVG、按钮、标签上使用在另一种主题下明显失真的颜色组合

## 设计风格摘要

当你生成 HTML/SVG widget 时：
- 不要只满足“能用”，要尽量做成有明确设计观点、可直接展示给用户的成品界面
- 生成前先明确用途、用户、语气、约束和记忆点，再决定视觉方向
- 避免 generic AI 风格、普通 demo 面板、默认浏览器控件堆砌、没有焦点的平均布局
- Typography、Color、Spatial Composition、Background Detail 都应服务于同一个审美方向
- 如果用户明确想要更强的前端视觉质量，请在调用 \`${VISUALIZE_READ_ME_TOOL_NAME}\` 时包含 \`design\` 模块，读取完整设计风格指导
`;
