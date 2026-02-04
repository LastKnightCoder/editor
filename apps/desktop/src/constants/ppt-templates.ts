// 导入各模板
import templateCinematic from "@/assets/ppt/template-cinematic.html?raw";
import templateMinimal from "@/assets/ppt/template-minimal.html?raw";
import templateCorporate from "@/assets/ppt/template-corporate.html?raw";
import templateTech from "@/assets/ppt/template-tech.html?raw";
import templateCreative from "@/assets/ppt/template-creative.html?raw";
import templateAcademic from "@/assets/ppt/template-academic.html?raw";
import templateNature from "@/assets/ppt/template-nature.html?raw";
import templateRetro from "@/assets/ppt/template-retro.html?raw";
import templateGradient from "@/assets/ppt/template-gradient.html?raw";
import templateDarkElegant from "@/assets/ppt/template-dark-elegant.html?raw";
import templateHandwritten from "@/assets/ppt/template-handwritten.html?raw";

export interface PPTTemplate {
  id: string;
  name: string;
  description: string;
  previewHtml: string;
  fullTemplate: string;
  styleGuide: string;
}

const cinematicStyleGuide = `
### 视觉风格 (Cinematic Style - 电影质感)
- **配色方案**: 深黑背景（#050505），琥珀金点缀色（#d4af37），危险红（#fa7873）
- **字体搭配**: 标题使用优雅衬线体（Georgia/宋体），正文使用极简非衬线体（Inter/苹方）
- **排版特点**: 大量留白，标题使用超大字号（3.5vw-6vw），内容层次分明
- **动态效果**: 
  - 页面切换使用 translateY + opacity 组合的平滑过渡
  - 列表项使用交错入场动画（Staggered Animation），依次淡入
  - 背景使用微弱的径向渐变光晕效果
- **装饰元素**: 顶部进度条、底部导航圆点、章节大号数字背景
- **内容卡片**: 半透明背景（rgba(255,255,255,0.02)），左侧金色边框
- **适用场景**: 高端演讲、品牌展示、故事叙述型内容
`;

const minimalStyleGuide = `
### 视觉风格 (Minimal Style - 极简明亮)
- **配色方案**: 浅灰白背景（#fafafa），深蓝黑文字（#1a1a2e），单一强调色
- **字体搭配**: 标题使用细衬线体（Georgia），正文使用现代无衬线体（Inter）
- **排版特点**: 
  - 90% 以上的留白空间，让内容自然呼吸
  - 超大字号标题（4vw-6vw），字重极轻（font-weight: 200-300）
  - 文字左对齐或居中，避免两端对齐
- **动态效果**: 
  - 微妙的淡入动画，避免花哨
  - 页面过渡使用简单的 opacity + translateY
- **装饰元素**: 
  - 极细的分割线（1px solid rgba）
  - 简洁的页码显示（01 / 07 格式）
  - 底部细线进度条
- **内容卡片**: 顶部细边框分隔，无背景色
- **适用场景**: 产品发布、设计展示、极简主义内容
`;

const corporateStyleGuide = `
### 视觉风格 (Corporate Style - 商务专业)
- **配色方案**: 
  - 纯白背景（#ffffff），浅灰辅助背景（#f8fafc）
  - 海军蓝主色（#1e3a5f），天蓝强调色（#0ea5e9）
  - 成功绿（#10b981）、警告橙（#f59e0b）用于数据展示
- **字体搭配**: 全程使用专业无衬线体（Inter），粗细变化表达层级
- **排版特点**: 
  - 顶部页眉显示 logo 和章节名称
  - 底部页脚显示页码和进度条
  - 清晰的信息层级：标签 → 标题 → 正文 → 数据
- **动态效果**: 
  - 页面从右侧滑入（translateX）
  - 列表项依次出现，带勾选图标
- **装饰元素**: 
  - 圆角卡片（border-radius: 12px）
  - 渐变色图标背景
  - 统计数字使用超大字号展示
- **数据展示**: 
  - 四列统计数字布局
  - 带图标的三列卡片布局
  - 带勾选标记的任务列表
- **适用场景**: 商业报告、投资路演、年度总结、项目汇报
`;

const techStyleGuide = `
### 视觉风格 (Tech Style - 科技感)
- **配色方案**: 
  - 深空灰背景（#0a0a0f）
  - 霓虹青（#00d4ff）、霓虹紫（#a855f7）、霓虹粉（#ec4899）
  - 文字使用浅灰白（#e4e4e7）
- **字体搭配**: 
  - 正文使用现代无衬线体（Inter）
  - 代码和标签使用等宽字体（SF Mono/Fira Code）
- **排版特点**: 
  - 标题使用渐变色填充效果（gradient text）
  - 标签使用类似代码注释的格式（&lt;Tag /&gt;、// SECTION_01）
- **动态效果**: 
  - 页面使用 scale 缩放过渡
  - 背景使用缓慢漂浮的渐变光晕动画
  - 时间线项目依次入场
- **装饰元素**: 
  - 网格背景（60px 间距的细线网格）
  - 模糊渐变光球（blur: 120px）
  - 发光边框效果（box-shadow glow）
  - 代码块带终端风格的三色圆点
- **内容卡片**: 
  - 半透明背景 + 细边框
  - 悬停时顶部出现渐变色边框
- **适用场景**: 技术分享、产品演示、开发者大会、科技发布会
`;

const creativeStyleGuide = `
### 视觉风格 (Creative Style - 创意艺术)
- **配色方案**: 
  - 深紫蓝背景（#1a1a2e）
  - 大胆的撞色：珊瑚红（#ff6b6b）、明黄（#feca57）、薄荷绿（#1dd1a1）、天蓝（#54a0ff）、紫罗兰（#9c88ff）
- **字体搭配**: 
  - 标题使用优雅的展示字体（Playfair Display），带斜体变化
  - 正文使用现代无衬线体
- **排版特点**: 
  - 不对称布局，打破常规网格
  - 标题可以偏移、倾斜（transform: rotate）
  - 使用镂空文字效果（-webkit-text-stroke）
- **动态效果**: 
  - 背景形状使用 morph 变形动画
  - 元素入场带有弹性曲线
  - 卡片悬停时旋转归正
- **装饰元素**: 
  - 有机形状的模糊渐变背景
  - 圆形编号徽章（不同颜色）
  - 倾斜的卡片布局（rotate: -2deg）
  - 超大引号装饰
- **内容卡片**: 
  - 彩色渐变背景
  - 倾斜排列，悬停时归正
- **大字排版**: 
  - 超大字号（6vw+）
  - 镂空与实体文字交替
  - 渐变色高亮词
- **适用场景**: 创意提案、艺术展示、品牌营销、设计作品集
`;

const academicStyleGuide = `
### 视觉风格 (Academic Style - 学术论文)
- **配色方案**: 
  - 米白纸张背景（#fffef9），浅米灰辅助背景（#f5f4ef）
  - 深蓝灰文字（#2c3e50），学术蓝强调色（#1a5f7a）
  - 高亮黄用于重点标记（#fff3cd）
- **字体搭配**: 
  - 标题使用学术衬线体（Crimson Text/思源宋体）
  - 正文使用易读的无衬线体（Source Sans Pro）
  - 代码使用等宽字体（SF Mono）
- **排版特点**: 
  - 传统论文排版风格，文本两端对齐
  - 清晰的章节编号（SECTION I, II, III...）
  - 严谨的信息层级
- **装饰元素**: 
  - 顶部细线进度条
  - 简洁的页码（1 / 8 格式）
  - 定义框（左侧边框 + 浅色背景）
- **学术特色**: 
  - 上标引用标记（[1]、[2]）
  - 脚注区域
  - 参考文献格式
  - 数据表格（带表头和表注）
- **内容组件**: 
  - 定义框（Definition Box）
  - 编号列表
  - 数据表格
  - 引用块（blockquote）
  - 参考文献列表
- **适用场景**: 学术报告、研究分享、论文答辩、教学课件
`;

const natureStyleGuide = `
### 视觉风格 (Nature Style - 自然清新)
- **配色方案**: 
  - 浅米背景（#f8f6f0），浅绿辅助背景（#eef5e9）
  - 森林绿主色（#2d6a4f），浅绿强调色（#95d5b2）
  - 深绿文字（#1b4332），灰绿次要文字（#52796f）
- **字体搭配**: 
  - 标题使用优雅衬线体（Georgia）
  - 正文使用清爽无衬线体（Inter）
- **排版特点**: 
  - 清新自然的排版风格
  - 圆角卡片设计
  - 柔和的阴影效果
- **装饰元素**: 
  - 叶片装饰（🌿🍃）
  - 底部进度条
  - 绿色渐变高亮
- **内容卡片**: 
  - 白色背景 + 圆角（16px）
  - 柔和阴影
  - 悬停上浮效果
- **适用场景**: 环保主题、健康生活、自然教育、生态报告
`;

const retroStyleGuide = `
### 视觉风格 (Retro Style - 复古怀旧)
- **配色方案**: 
  - 深棕黑背景（#1a1612），暗褐辅助背景（#2a2420）
  - 古铜金主色（#c9a96e），深棕强调色（#8b4513）
  - 米黄文字（#e8dcc8）
- **字体搭配**: 
  - 全程使用优雅衬线体（Georgia）
  - 标题带字间距（letter-spacing）
- **排版特点**: 
  - 经典对称布局
  - 装饰性边角
  - 罗马数字页码
- **装饰元素**: 
  - 做旧纹理背景（噪点效果）
  - 四角装饰边框
  - 分隔线装饰（✦ ✦ ✦）
  - 阴影层叠卡片效果
- **动态效果**: 
  - 缓慢优雅的过渡动画
  - 时间线依次入场
- **适用场景**: 历史主题、文化传承、复古品牌、怀旧叙事
`;

const gradientStyleGuide = `
### 视觉风格 (Gradient Style - 渐变流光)
- **配色方案**: 
  - 动态渐变背景（紫→蓝→粉→橙循环）
  - 纯白文字
  - 半透明玻璃效果
- **字体搭配**: 
  - 标题使用粗体无衬线（Inter Bold）
  - 正文使用常规无衬线
- **排版特点**: 
  - 居中布局为主
  - 玻璃拟态卡片
  - 大胆的视觉冲击
- **动态效果**: 
  - 背景渐变流动动画（15s 循环）
  - 漂浮光斑效果
  - 缩放式页面过渡
- **装饰元素**: 
  - 模糊光球装饰
  - 玻璃拟态边框（backdrop-filter: blur）
  - 底部导航点
- **内容卡片**: 
  - 半透明背景（rgba）
  - 模糊玻璃效果
  - 悬停上浮 + 加深效果
- **适用场景**: 产品发布、品牌展示、潮流设计、现代艺术
`;

const darkElegantStyleGuide = `
### 视觉风格 (Dark Elegant Style - 暗夜优雅)
- **配色方案**: 
  - 纯黑背景（#000000）
  - 纯白文字（#ffffff）
  - 极淡白装饰（rgba(255,255,255,0.15)）
- **字体搭配**: 
  - 标题使用超细衬线体（Georgia，font-weight: 200-300）
  - 正文使用细无衬线体
- **排版特点**: 
  - 极致简约
  - 超大留白
  - 克制的装饰
- **动态效果**: 
  - 缓慢淡入过渡（1.2s）
  - 极简的动画效果
- **装饰元素**: 
  - 顶部极细进度线（1px）
  - 简洁页码
  - 网格分隔卡片
- **内容卡片**: 
  - 1px 边框分隔
  - 无背景或极淡背景
  - 悬停微妙变化
- **适用场景**: 高端品牌、奢侈品展示、极简设计、艺术展览
`;

const handwrittenStyleGuide = `
### 视觉风格 (Handwritten Style - 手绘风格)
- **配色方案**: 
  - 浅纸张背景（#faf8f5），米白卡片（#fffef9）
  - 墨水黑文字（#2d2d2d）
  - 橙红强调色（#e07b53），蓝色次强调（#4a90a4）
- **字体搭配**: 
  - 标题使用手写字体（Caveat 或类似手写风格）
  - 正文使用清晰无衬线体
- **排版特点**: 
  - 轻微倾斜的元素（rotate: ±2deg）
  - 不规则边框（虚线 dashed）
  - 手绘装饰图案
- **装饰元素**: 
  - 纸张横线纹理背景
  - 手绘风格下划线（SVG 波浪线）
  - 表情符号装饰（✏️📝🌟）
  - 便签纸效果（黄色背景 + 图钉）
- **内容卡片**: 
  - 虚线边框
  - 不规则圆角
  - 轻微倾斜
- **列表样式**: 
  - 手绘复选框（☐ / ☑）
  - 轻松随意的排列
- **适用场景**: 教育课件、创意工作坊、笔记分享、轻松演讲
`;

const generatePreviewHtml = (
  bgColor: string,
  textColor: string,
  accentColor: string,
  title: string,
  subtitle: string,
  style: "dark" | "light" | "gradient",
): string => {
  const bgStyle =
    style === "gradient"
      ? `background: linear-gradient(135deg, ${bgColor} 0%, ${accentColor}40 100%);`
      : `background: ${bgColor};`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { 
  ${bgStyle}
  color: ${textColor}; 
  font-family: system-ui, -apple-system, sans-serif;
  width: 100vw; height: 100vh;
  display: flex; flex-direction: column;
  justify-content: center; align-items: center;
  text-align: center; padding: 20px;
}
.title { 
  font-size: 24px; font-weight: 600;
  margin-bottom: 8px; letter-spacing: -0.5px;
}
.subtitle { 
  font-size: 11px; opacity: 0.6;
  letter-spacing: 1px;
}
.accent-line {
  width: 40px; height: 2px;
  background: ${accentColor};
  margin-top: 16px;
}
</style>
</head>
<body>
<div class="title">${title}</div>
<div class="subtitle">${subtitle}</div>
<div class="accent-line"></div>
</body>
</html>`;
};

export const PPT_TEMPLATES: PPTTemplate[] = [
  {
    id: "cinematic",
    name: "电影质感",
    description: "深色背景，金色点缀，优雅的交错动画，适合高端演讲",
    previewHtml: generatePreviewHtml(
      "#050505",
      "#e0e0e0",
      "#d4af37",
      "电影质感",
      "CINEMATIC",
      "dark",
    ),
    fullTemplate: templateCinematic,
    styleGuide: cinematicStyleGuide,
  },
  {
    id: "minimal",
    name: "极简明亮",
    description: "浅色背景，大量留白，优雅简约，适合产品发布",
    previewHtml: generatePreviewHtml(
      "#fafafa",
      "#1a1a2e",
      "#1a1a2e",
      "极简明亮",
      "MINIMAL",
      "light",
    ),
    fullTemplate: templateMinimal,
    styleGuide: minimalStyleGuide,
  },
  {
    id: "corporate",
    name: "商务专业",
    description: "白色背景，海军蓝主色，清晰的信息层级，适合商业报告",
    previewHtml: generatePreviewHtml(
      "#ffffff",
      "#1e3a5f",
      "#0ea5e9",
      "商务专业",
      "CORPORATE",
      "light",
    ),
    fullTemplate: templateCorporate,
    styleGuide: corporateStyleGuide,
  },
  {
    id: "tech",
    name: "科技感",
    description: "深色背景，霓虹渐变，网格动效，适合技术分享",
    previewHtml: generatePreviewHtml(
      "#0a0a0f",
      "#e4e4e7",
      "#00d4ff",
      "科技感",
      "TECH",
      "dark",
    ),
    fullTemplate: templateTech,
    styleGuide: techStyleGuide,
  },
  {
    id: "creative",
    name: "创意艺术",
    description: "大胆撞色，不对称布局，视觉冲击，适合创意提案",
    previewHtml: generatePreviewHtml(
      "#1a1a2e",
      "#ffffff",
      "#ff6b6b",
      "创意艺术",
      "CREATIVE",
      "gradient",
    ),
    fullTemplate: templateCreative,
    styleGuide: creativeStyleGuide,
  },
  {
    id: "academic",
    name: "学术论文",
    description: "米白背景，传统排版，引用格式，适合学术报告",
    previewHtml: generatePreviewHtml(
      "#fffef9",
      "#2c3e50",
      "#1a5f7a",
      "学术论文",
      "ACADEMIC",
      "light",
    ),
    fullTemplate: templateAcademic,
    styleGuide: academicStyleGuide,
  },
  {
    id: "nature",
    name: "自然清新",
    description: "绿色系配色，清爽简洁，适合环保健康主题",
    previewHtml: generatePreviewHtml(
      "#f8f6f0",
      "#2d6a4f",
      "#95d5b2",
      "自然清新",
      "NATURE",
      "light",
    ),
    fullTemplate: templateNature,
    styleGuide: natureStyleGuide,
  },
  {
    id: "retro",
    name: "复古怀旧",
    description: "深棕色调，做旧质感，适合历史文化主题",
    previewHtml: generatePreviewHtml(
      "#1a1612",
      "#e8dcc8",
      "#c9a96e",
      "复古怀旧",
      "RETRO",
      "dark",
    ),
    fullTemplate: templateRetro,
    styleGuide: retroStyleGuide,
  },
  {
    id: "gradient",
    name: "渐变流光",
    description: "多彩渐变背景，玻璃拟态，现代潮流风",
    previewHtml: generatePreviewHtml(
      "#667eea",
      "#ffffff",
      "#f093fb",
      "渐变流光",
      "GRADIENT",
      "gradient",
    ),
    fullTemplate: templateGradient,
    styleGuide: gradientStyleGuide,
  },
  {
    id: "dark-elegant",
    name: "暗夜优雅",
    description: "纯黑背景，白色文字，极简高级感",
    previewHtml: generatePreviewHtml(
      "#000000",
      "#ffffff",
      "#ffffff",
      "暗夜优雅",
      "ELEGANT",
      "dark",
    ),
    fullTemplate: templateDarkElegant,
    styleGuide: darkElegantStyleGuide,
  },
  {
    id: "handwritten",
    name: "手绘风格",
    description: "手写字体，简笔画装饰，轻松随意",
    previewHtml: generatePreviewHtml(
      "#faf8f5",
      "#2d2d2d",
      "#e07b53",
      "手绘风格",
      "SKETCH",
      "light",
    ),
    fullTemplate: templateHandwritten,
    styleGuide: handwrittenStyleGuide,
  },
];

export const DEFAULT_TEMPLATE_ID = "cinematic";

export const getTemplateById = (id: string): PPTTemplate | undefined => {
  return PPT_TEMPLATES.find((t) => t.id === id);
};

export const getDefaultTemplate = (): PPTTemplate => {
  const template = PPT_TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID);
  // 由于 DEFAULT_TEMPLATE_ID 是硬编码的 'cinematic'，且 PPT_TEMPLATES 第一个就是该模板
  // 所以这里一定能找到，使用 fallback 只是为了满足类型检查
  return template ?? PPT_TEMPLATES[0];
};
