/** 产品片文案：开场、片尾 */
export const BRAND = { name: "Tau", line: "你的个人知识工作台" };
export const SLOGAN = "让想法，长成体系。";
export const URL = "taunote.app";
/** 片尾：官网下载区原句 */
export const ENDING = { start: "从下一个想法开始。", free: "免费下载，不用注册" };

/** 章节宣言：取官网各区块标题（apps/website/index.html） */
export const MANIFESTOS = {
  write: { text: "所见，即所得。", sub: "熟悉的语法，敲下去就是排好的样子", accent: [0, 2] as [number, number] },
  board: { text: "把想法摊开，再收拢。", sub: "导图、画框、箭头随手摆，排好就能演示", accent: [3, 5] as [number, number] },
  database: { text: "一份数据，四种看法。", sub: "表格 · 看板 · 画廊 · 日历", accent: [5, 7] as [number, number] },
  ai: { text: "它认识你写过的一切。", sub: "小管家 · 洞见 · 创作模式", accent: [7, 9] as [number, number] },
  map: { text: "想法之间，自有引力。", sub: "知识地图 · 双向关联 · 相关推荐", accent: [7, 9] as [number, number] },
  daily: { text: "写作之外的日子，也在这里。", sub: "番茄专注 · 待办 · 日程 · 日记", accent: [5, 7] as [number, number] },
  plugins: { text: "装一个插件，多一种能力。", sub: "页面 · 编辑器块 · 白板元素 · 同步存储", accent: [3, 5] as [number, number] },
  life: { text: "一个想法的一生。", sub: "输入 · 消化 · 输出 · 复习 · 总览 · 分享", accent: [2, 4] as [number, number] },
};

/** 知识闭环六步（官网知识闭环区块），feature 是底部模块标签的说明 */
export const STEPS = [
  { name: "输入", feature: "浏览器插件划线，记得出处" },
  { name: "消化", feature: "收进 Notebook，读不懂就问" },
  { name: "输出", feature: "读到的一句话，成了自己的卡片" },
  { name: "复习", feature: "闪卡帮你记住" },
  { name: "总览", feature: "进入知识地图，看见它连着谁" },
  { name: "分享", feature: "勾选内容，一键发布成博客" },
];

/** 知识地图段底部的模块标签 */
export const MAP_TAGS = [
  { module: "双链", feature: "敲 [[，连上写过的任何一条" },
  { module: "知识地图", feature: "所有内容自动聚成主题，看得见谁连着谁" },
  { module: "生长回放", feature: "看看它是怎么长出来的" },
  { module: "地图洞见", feature: "跨主题，找出遥相呼应的笔记" },
];

/** All in one 段底部的模块标签 */
export const DAILY_TAGS = [
  { module: "番茄专注", feature: "专注于一条待办，做完自动记进日程" },
  { module: "待办", feature: "截止、计划、打卡，一张清单排好" },
  { module: "日程", feature: "番茄和截止任务，自动出现在日历上" },
  { module: "日记", feature: "想到什么写一句，回车就记下" },
  { module: "今日", feature: "专注时长、完成的待办、写下的字，最后都汇到这里" },
];

/** 插件 + 本地段底部的模块标签 */
export const PLUGIN_TAGS = [
  { module: "插件中心", feature: "挑一个插件，一键安装" },
  { module: "微信读书", feature: "书架、划线与想法，同步进 Tau" },
  { module: "导出", feature: "笔记存在你自己的电脑里，随时导出 Markdown" },
];

export const PRODUCT_GLYPHS =
  BRAND.name +
  BRAND.line +
  SLOGAN +
  URL +
  ENDING.start +
  ENDING.free +
  "⌘⇧N" +
  "写作 · WRITING" +
  Object.values(MANIFESTOS)
    .map(m => m.text + m.sub)
    .join("") +
  STEPS.map(s => s.name + s.feature).join("") +
  "0123456789" +
  "小管家说一句话，它替你动手洞见对照你的笔记，查漏补缺创作模式不从一张白纸开始" +
  MAP_TAGS.map(t => t.module + t.feature).join("") +
  DAILY_TAGS.map(t => t.module + t.feature).join("") +
  PLUGIN_TAGS.map(t => t.module + t.feature).join("");
