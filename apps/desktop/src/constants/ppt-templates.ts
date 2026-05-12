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
import templateCyberpunk from "@/assets/ppt/template-cyberpunk.html?raw";
import templateZen from "@/assets/ppt/template-zen.html?raw";
import templateWatercolor from "@/assets/ppt/template-watercolor.html?raw";
import templateBlueprint from "@/assets/ppt/template-blueprint.html?raw";
import templateBrutalism from "@/assets/ppt/template-brutalism.html?raw";

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
- **字体**: Google Fonts 导入 DM Serif Display（标题衬线）+ DM Sans（正文）+ JetBrains Mono（标签/代码）
- **配色**: 深黑背景 #050505，琥珀金 #d4af37，危险红 #fa7873，温暖奶白文字 #e8e0d0
- **排版**: 所有字号使用 clamp()，标题 clamp(2.2rem, 5.5vw, 5rem)，大量留白
- **动效**: 缓慢戏剧性过渡 800-1200ms，cubic-bezier(0.16, 1, 0.3, 1) 缓动
- **Reveal 系统**: .reveal / .reveal-scale / .reveal-left / .reveal-right + .delay-1~5 交错入场
- **背景**: 径向渐变光晕 + body::after SVG 噪点纹理覆盖层
- **装饰**: 顶部进度条、右下角页码（01 / 14）、章节巨型水印数字（20vw 极淡金色）
- **卡片**: 半透明 rgba(255,255,255,0.02) + 左侧金色 2px 边框 + hover 加深
- **章节过渡**: 巨型背景数字 + 衬线章节标题，居中布局
- **断点**: max-height: 750px / 650px / 500px+landscape, max-width: 768px
- **无障碍**: prefers-reduced-motion 支持
- **JS**: SlidePresentation class，支持键盘/滚轮/触摸导航，data-count 计数动画
`;

const minimalStyleGuide = `
### 视觉风格 (Minimal Style - 极简中性)
- **字体**: Google Fonts 导入 Newsreader（衬线标题 400-500）+ Inter（正文 400-600）
- **配色**: 纯白背景 #ffffff，浅灰面板 #f5f5f5，纯黑文字 #141414，次要文字 #525252，柔和文字 #8a8a8a，边框 #e5e5e5，强调色 #141414（黑色即强调），极淡背景 rgba(20,20,20,0.04)
- **排版**: 所有字号用 clamp()，衬线标题 clamp(4rem, 10vw, 12rem)，正文 clamp(1rem, 1.2vw, 1.3rem)，字重 400-500（标题）/ 400（正文），衬线与无衬线对比建立层级，极致尺度差创造视觉冲击
- **动效**: 微妙淡入 550ms，ease-out-quart cubic-bezier(0.25, 1, 0.5, 1)，translateY(18px) 入场
- **Reveal 系统**: .reveal / .reveal-scale / .reveal-left / .reveal-right + .delay-1~6 交错（每级 100ms）
- **背景**: 纯白，无纹理无装饰，极度克制
- **装饰**: 2px 黑色短横线作为分隔符（cover-rule / chapter-rule / def-rule / end-rule），顶部 2px 进度条，右下角页码
- **布局**: 封面和章节页左对齐（编辑式排版），定义页和声明页居中，正文最大宽度 60ch，大量留白，章节数字极大（20rem）制造纵深
- **卡片**: 使用 bg-alt (#f5f5f5) 淡色背景块替代边框卡片，无圆角，极简
- **数据**: 衬线大号数字 + 黑色后缀标记，进度条使用黑色填充
- **对比度**: 所有文本至少 WCAG AA（4.5:1+），主文本 #141414 on #ffffff ≈ 18.3:1，次要文本 #525252 ≈ 7.5:1
- **断点**: max-height: 750px / 650px / 500px+landscape, max-width: 768px
- **无障碍**: prefers-reduced-motion 支持
- **JS**: SlidePresentation class，键盘/滚轮/触摸/全览导航，data-count 计数动画
`;

const corporateStyleGuide = `
### 视觉风格 (Corporate Style - 商务权威)
- **字体**: Google Fonts 导入 Source Serif 4（衬线标题展示 300-700）+ Work Sans（正文 300-600）+ Fira Code（标签/数据/等宽）
- **配色**: OKLCH 色彩系统——深暖灰板岩 oklch(0.22 0.01 250)，赤陶强调 oklch(0.65 0.14 35)，鼠尾草绿次要 oklch(0.72 0.06 160)，暖白文字 oklch(0.93 0.01 80)
- **排版**: 所有字号 clamp()，衬线标题对比无衬线正文，层级通过 ≥1.5 倍比 + weight 对比（Display 400 vs Body 300）
- **动效**: 指数 ease-out cubic-bezier(0.16, 1, 0.3, 1)，500-600ms，无弹性回弹
- **Reveal 系统**: .reveal / .reveal-scale / .reveal-left / .reveal-right + .d1~d8 延迟交错（每级 80ms）
- **背景**: 暖深灰板岩色 + body::after SVG feTurbulence 噪点纹理 (0.025 opacity)
- **装饰**: 克制——2px 赤陶色短横线作为分隔符，巨型衬线幽灵数字 (6-8% opacity) 营造层次，建筑感直角 border-radius: 2-6px
- **布局**: 不对称网格（35/65 分栏），内容左对齐为主，留白不均匀营造节奏感，1px 分隔线替代卡片包裹
- **数据展示**: Source Serif 4 大号数字左对齐 + Fira Code 标签，四列统计通过竖线分隔而非卡片，进度条置于 graph-paper 网格背景上
- **时间线**: 竖向布局 + 赤陶方形节点 + 等宽日期左置
- **章节过渡**: 巨型幽灵数字（14vw 衬线，底部右侧出血）+ 居中衬线标题 + 赤陶短线
- **进度条**: 底部 2px 细线（赤陶→鼠尾草渐变），Fira Code 等宽页码
- **断点**: max-height: 750px / 650px / 500px+landscape, max-width: 768px
- **无障碍**: prefers-reduced-motion 支持
- **JS**: SlidePresentation class，键盘/滚轮/触摸/全览导航，data-count 计数动画
`;

const techStyleGuide = `
### 视觉风格 (Tech Style - 科技感)
- **字体**: Google Fonts 导入 Space Grotesk（标题）+ Inter（正文）+ JetBrains Mono（代码/标签）
- **配色**: 深空灰 #0a0a0f，霓虹青 #00d4ff，霓虹紫 #a855f7，霓虹粉 #ec4899，灰白文字 #e4e4e7
- **排版**: 所有字号用 clamp()，标题渐变色填充（cyan→purple），标签用代码注释风格
- **动效**: 弹性过冲 300-600ms，cubic-bezier(0.34, 1.56, 0.64, 1)，scale 缩放过渡
- **Reveal 系统**: .reveal / .reveal-scale / .reveal-left / .reveal-right + delay 交错
- **背景**: 60px 网格线 + 3-4 个浮动渐变模糊光球（纯 CSS fixed 定位 + blur:120px）
- **装饰**: 发光边框 box-shadow glow，代码块带终端三色圆点，进度条+页码
- **卡片**: 半透明 rgba + 细边框，hover 时顶部渐变发光边框
- **代码块**: 终端风格头部（红黄绿三圆点）+ 深色背景 + 语法高亮色
- **断点**: max-height: 750px / 650px / 500px+landscape, max-width: 768px
- **无障碍**: prefers-reduced-motion 支持
- **JS**: SlidePresentation class，键盘/滚轮/触摸导航，data-count 计数动画
`;

const creativeStyleGuide = `
### 视觉风格 (Creative Style - 创意艺术)
- **字体**: Google Fonts 导入 Syne（展示标题）+ Space Mono（等宽标签）+ DM Sans（正文）
- **配色**: 深紫蓝 #1a1a2e，珊瑚红 #ff6b6b，明黄 #feca57，薄荷绿 #1dd1a1，天蓝 #54a0ff，紫罗兰 #9c88ff
- **排版**: 所有字号用 clamp()，不对称布局打破网格，标题可倾斜 rotate
- **动效**: 弹性曲线 300-500ms，cubic-bezier(0.34, 1.56, 0.64, 1)
- **Reveal 系统**: .reveal / .reveal-scale / .reveal-left / .reveal-right + delay 交错
- **背景**: 有机 blob 形状（CSS border-radius 变形动画）+ 半调点阵纹理
- **装饰**: 彩色圆形编号徽章，超大装饰引号，渐变进度条，页码计数器
- **卡片**: 倾斜 rotate(-2deg) + hover 归正，彩色渐变背景
- **文字**: 镂空效果 -webkit-text-stroke，渐变色填充，混合字重对比
- **大字排版**: clamp(2.5rem, 8vw, 7rem) 超大冲击字号
- **断点**: max-height: 750px / 650px / 500px+landscape, max-width: 768px
- **无障碍**: prefers-reduced-motion 支持
- **JS**: SlidePresentation class，键盘/滚轮/触摸导航，data-count 计数动画
`;

const academicStyleGuide = `
### 视觉风格 (Academic Style - 学术论文)
- **字体**: Google Fonts 导入 Crimson Text（标题衬线）+ Source Sans 3（正文）+ JetBrains Mono（代码/数据）
- **配色**: 米白纸张 #fffef9，浅米灰 #f5f4ef，深蓝灰 #2c3e50，学术蓝 #1a5f7a，高亮黄 #fff3cd
- **排版**: 所有字号用 clamp()，传统论文排版 text-align: justify，章节编号 SECTION I/II/III
- **动效**: 克制稳重 400-600ms，ease 缓动
- **Reveal 系统**: .reveal / .reveal-scale / .reveal-left / .reveal-right + delay 交错
- **背景**: 温暖米白纸张质感，无花哨装饰
- **装饰**: 细线进度条，1/12 格式页码，左侧蓝色边框定义框
- **学术组件**: 上标引用 [1][2]，脚注区，参考文献悬挂缩进，数据表格含 caption+note
- **卡片**: 定义框（蓝色左边框 + 浅色背景），blockquote 左边框引用
- **断点**: max-height: 750px / 650px / 500px+landscape, max-width: 768px
- **无障碍**: prefers-reduced-motion 支持
- **JS**: SlidePresentation class，键盘/滚轮/触摸导航，data-count 计数动画
`;

const natureStyleGuide = `
### 视觉风格 (Nature Style - 自然清新)
- **字体**: Google Fonts 导入 Plus Jakarta Sans（全局使用）
- **配色**: 暖亚麻 #f8f6f0，柔绿 #eef5e9，森林绿 #2d6a4f，浅绿 #95d5b2，深绿 #1b4332，灰绿 #52796f
- **排版**: 所有字号用 clamp()，圆角 16px+，柔和阴影，清新自然排版
- **动效**: 平滑舒缓 500-800ms，ease 缓动
- **Reveal 系统**: .reveal / .reveal-scale / .reveal-left / .reveal-right + delay 交错
- **背景**: 暖亚麻色或柔绿交替，无硬边
- **装饰**: 🌿🍃🌱 叶片装饰（克制使用），绿色渐变高亮下划线，进度条+页码
- **卡片**: 白色背景 + 圆角 16px + 柔和阴影，hover 上浮 + 阴影加深
- **有机元素**: 波浪分隔线（CSS clip-path），温暖大地色系
- **断点**: max-height: 750px / 650px / 500px+landscape, max-width: 768px
- **无障碍**: prefers-reduced-motion 支持
- **JS**: SlidePresentation class，键盘/滚轮/触摸导航，data-count 计数动画
`;

const retroStyleGuide = `
### 视觉风格 (Retro Style - 复古怀旧)
- **字体**: Google Fonts 导入 Fraunces（展示衬线）+ Work Sans（正文无衬线）
- **配色**: 深棕黑 #1a1612，暗褐 #2a2420，古铜金 #c9a96e，深棕 #8b4513，米黄 #e8dcc8
- **排版**: 所有字号用 clamp()，经典对称布局，字间距 letter-spacing，罗马数字页码
- **动效**: 缓慢优雅 800-1200ms，ease 缓动
- **Reveal 系统**: .reveal / .reveal-scale / .reveal-left / .reveal-right + delay 交错
- **背景**: body::after SVG feTurbulence 噪点纹理做旧效果
- **装饰**: 四角装饰边框（CSS 伪元素），✦ ✦ ✦ 分隔线，❦ 花饰，罗马年份
- **卡片**: 层叠阴影效果（::before + ::after 双层偏移），古铜金色边框
- **时间线**: 竖向时间线 + 金色圆点标记
- **断点**: max-height: 750px / 650px / 500px+landscape, max-width: 768px
- **无障碍**: prefers-reduced-motion 支持
- **JS**: SlidePresentation class，键盘/滚轮/触摸导航，data-count 计数动画，罗马数字页码
`;

const gradientStyleGuide = `
### 视觉风格 (Gradient Style - 渐变流光)
- **字体**: Google Fonts 导入 Inter（300-700 全权重）
- **配色**: 动态渐变背景（紫→蓝→粉→橙 15-20s 循环），纯白文字，半透明玻璃效果
- **排版**: 所有字号用 clamp()，居中布局为主，粗体标题 600-700
- **动效**: scale 缩放页面过渡 400-600ms，背景渐变流动 @keyframes 15s 循环
- **Reveal 系统**: .reveal / .reveal-scale / .reveal-left / .reveal-right + delay 交错
- **背景**: CSS 动态渐变 + 3-4 个浮动模糊光球（fixed 定位，独立动画轨迹）
- **装饰**: 玻璃拟态边框 backdrop-filter: blur(20px)，进度条+玻璃页码
- **卡片**: rgba(255,255,255,0.08) + backdrop-filter: blur(20px) + 白色半透明边框
- **hover**: 玻璃加深 + 微浮 + glow 效果
- **断点**: max-height: 750px / 650px / 500px+landscape, max-width: 768px
- **无障碍**: prefers-reduced-motion 支持（禁用渐变动画和光球浮动）
- **JS**: SlidePresentation class，键盘/滚轮/触摸导航，data-count 计数动画
`;

const darkElegantStyleGuide = `
### 视觉风格 (Dark Elegant Style - 暗夜优雅)
- **字体**: Google Fonts 导入 DM Serif Display（展示衬线 400）+ Plus Jakarta Sans（正文 300/400/500/600）
- **配色**: 深暖黑 #0f0e0d，暖白文字 #e8e5e0，中灰 #9c9590，暗灰 #6b6560，幽灵色 #1e1c1a，结构线 #2a2724
- **排版**: 所有字号用 clamp()，强对比衬线标题 font-weight: 400，纯色调层级无强调色
- **动效**: 精确 800ms 切换，550ms reveal，cubic-bezier(0.16, 1, 0.3, 1) 指数缓出
- **Reveal 系统**: .reveal / .reveal-scale / .reveal-left / .reveal-right + d1-d10 延迟（140ms 间隔）
- **背景**: 深暖黑纯色，无装饰无渐变
- **签名元素**: 超大幽灵数字（22vw）作为构图纹理，极低对比度 #1e1c1a
- **结构**: 1px 细线分隔，非对称左重布局（左 padding 大于右）
- **卡片**: 无边框无背景，纯留白分隔
- **留白**: 极致深色留白，非对称构图创造编辑感张力
- **无装饰**: 不使用 emoji、图标、色块或任何装饰元素
- **页码**: 点分隔符 · 代替斜杠
- **断点**: max-height: 750px / 650px / 500px+landscape, max-width: 768px
- **无障碍**: prefers-reduced-motion 支持
- **JS**: SlidePresentation class，键盘/滚轮/触摸导航，data-count 计数动画（支持小数）
`;

const handwrittenStyleGuide = `
### 视觉风格 (Handwritten Style - 手绘风格)
- **字体**: Google Fonts 导入 Caveat（手写展示标题）+ Nunito（正文无衬线）
- **配色**: 暖纸张 #faf8f5，米白卡片 #fffef9，墨水黑 #2d2d2d，橙红 #e07b53，蓝色 #4a90a4
- **排版**: 所有字号用 clamp()，轻微倾斜元素 rotate(±1-2deg)，虚线边框 dashed
- **动效**: 弹跳俏皮 300-500ms，cubic-bezier(0.34, 1.56, 0.64, 1)
- **Reveal 系统**: .reveal / .reveal-scale / .reveal-left / .reveal-right + delay 交错
- **背景**: 纸张横线纹理（repeating-linear-gradient）+ 红色竖线装饰
- **装饰**: ✏️📝🌟⭐💡 emoji 装饰，手绘 SVG 波浪下划线，📌 图钉
- **卡片**: 虚线边框 + 不规则圆角 + 轻微倾斜 + hover 归正
- **便签**: 黄色背景 #fff9c4 + 旋转 + 图钉 emoji
- **复选框**: ☐ / ☑ 手绘复选框列表
- **断点**: max-height: 750px / 650px / 500px+landscape, max-width: 768px
- **无障碍**: prefers-reduced-motion 支持
- **JS**: SlidePresentation class，键盘/滚轮/触摸导航，data-count 计数动画
`;

const cyberpunkStyleGuide = `
### 视觉风格 (Cyberpunk Style - 霓虹赛博朋克)
- **字体**: Google Fonts 导入 Orbitron（展示标题）+ Share Tech Mono（标签/代码）+ Inter（正文）
- **配色**: 深黑背景 #080810，霓虹绿 #0dff8c，电光粉 #ff0080，赛博青 #00d4ff，文字 #e0e8ff
- **排版**: 所有字号用 clamp()，标题使用 Orbitron 全大写，标签前缀 // 或 >>
- **动效**: 弹性过冲 300-600ms，cubic-bezier(0.34, 1.56, 0.64, 1)，故障闪烁效果
- **Reveal 系统**: .reveal / .reveal-scale / .reveal-left / .reveal-right + delay 交错
- **背景**: 50px 等距网格线（rgba 极淡）+ 扫描线纹理 repeating-linear-gradient
- **装饰**: 霓虹发光 box-shadow glow，glitch 伪元素错位动画，::before/::after 角标
- **卡片**: 半透明深色背景 + 1px 绿色边框 + hover 发光效果
- **标签**: 方括号 [TAG] 或尖括号风格，单色边框
- **进度条**: 顶部 2px 渐变线（绿→青），右下角 Orbitron 等宽页码
- **断点**: max-height: 750px / 650px / 500px+landscape, max-width: 768px
- **无障碍**: prefers-reduced-motion 支持（禁用 glitch 动画）
- **JS**: SlidePresentation class，键盘/滚轮/触摸导航，data-count 计数动画
`;

const zenStyleGuide = `
### 视觉风格 (Zen Style - 禅意东方)
- **字体**: Google Fonts 导入 Noto Serif SC（标题衬线）+ Noto Sans SC（正文）
- **配色**: 宣纸白 #f9f5ec，墨黑 #1a1a1a，朱红 #c0392b，竹绿 #4a7c59，古金 #b8960c
- **排版**: 所有字号用 clamp()，大量留白，letter-spacing 0.03~0.1em，行高 1.8~2
- **动效**: 平滑舒缓 600-800ms，ease 缓动，避免弹性效果
- **Reveal 系统**: .reveal / .reveal-scale / .reveal-left / .reveal-right + delay 交错
- **背景**: 宣纸纹理（SVG feTurbulence 极淡叠层），暖白色调
- **装饰**: 朱红细线分割，印章方框（边框），brush-line 水墨渐变线
- **卡片**: 白色背景 + 1px 细边框 + 悬停顶部朱红线
- **页码**: 汉字计数（一/二/三...），衬线字体，分隔符「／」
- **章节**: 极淡巨型汉字底部水印 + 醒目标题前景
- **断点**: max-height: 750px / 650px / 500px+landscape, max-width: 768px
- **无障碍**: prefers-reduced-motion 支持
- **JS**: SlidePresentation class，键盘/滚轮/触摸导航，汉字页码，data-count 计数动画
`;

const watercolorStyleGuide = `
### 视觉风格 (Watercolor Style - 水彩插画)
- **字体**: Google Fonts 导入 Playfair Display（展示标题 + italic）+ Lato（正文 300/400/700）
- **配色**: 暖白 #fefcf7，胭脂粉 #f4a8b8，天空蓝 #a8c4e4，薄荷绿 #a8c8a8，蜜桃橙 #f4c8a0，文字 #3d3535
- **排版**: 所有字号用 clamp()，斜体标题（font-style: italic）增加艺术感，圆角卡片
- **动效**: 柔和淡入 500-700ms，ease 缓动，圆角卡片 hover 上浮
- **Reveal 系统**: .reveal / .reveal-scale / .reveal-left / .reveal-right + delay 交错
- **背景**: 3 个 CSS radial-gradient 模糊光球模拟水彩晕染效果（fixed 定位，filter: blur）
- **装饰**: 渐变水彩分割线，圆形彩色圆点装饰，圆角标签胶囊（border-radius: 20px）
- **卡片**: 白色背景 + 16px 圆角 + 柔和阴影，hover 上浮 + 阴影加深
- **颜色系统**: 5 色水彩调色板依序循环应用于卡片、列表圆点等
- **进度条**: 顶部 3px 渐变线（粉→蓝），右下角 Playfair Display 斜体页码
- **断点**: max-height: 750px / 650px / 500px+landscape, max-width: 768px
- **无障碍**: prefers-reduced-motion 支持
- **JS**: SlidePresentation class，键盘/滚轮/触摸导航，data-count 计数动画
`;

const blueprintStyleGuide = `
### 视觉风格 (Blueprint Style - 蓝图工程)
- **字体**: Google Fonts 导入 Share Tech（标题/正文）+ Space Mono（标签/代码/页码）
- **配色**: 工程蓝 #061020，面板蓝 #0a1a30，白色 #ffffff，图纸黄 #ffcb00，工程青 #00c8e8，文字 #d0e4f8
- **排版**: 所有字号用 clamp()，等宽字体标签，letter-spacing 技术感，大写标注
- **动效**: 快速专业 350-500ms，ease-out 缓动，无花哨效果
- **Reveal 系统**: .reveal / .reveal-scale / .reveal-left / .reveal-right + delay 交错
- **背景**: 双层网格（80px 主网格 + 20px 细网格），rgba 极淡叠加，四角 L 形标注线
- **装饰**: 顶部黄色 2px 进度条，边框标注框（::before content: 'DEF'），图纸角落装饰
- **卡片**: 1px 边框 + 半透明深色背景 + 顶部彩色 2px 分类线（黄/青交替）
- **代码块**: 终端风格头部三圆点 + Space Mono 等宽字体 + 语法高亮（cyan 关键字/yellow 函数）
- **标签**: 方括号边框 [TAG] 风格，单色细边框
- **断点**: max-height: 750px / 650px / 500px+landscape, max-width: 768px
- **无障碍**: prefers-reduced-motion 支持
- **JS**: SlidePresentation class，键盘/滚轮/触摸导航，data-count 计数动画（支持小数）
`;

const brutalismStyleGuide = `
### 视觉风格 (Brutalism Style - 粗野主义/新残酷主义)
- **字体**: Google Fonts 导入 Space Grotesk（标题 700-900）+ Inter（正文 400-600）+ Space Mono（标签/数据/等宽）
- **配色**: 米白背景 #FFFDF5，纯黑边框文字 #1A1A1A，明黄 #FFE600，正红 #FF3333，电蓝 #2E4CFF，亮绿 #00CC66，混凝土灰 #F0ECE2，次要文字 #555555
- **排版**: 所有字号用 clamp()，标题 font-weight: 900 超粗体 + letter-spacing: -2px 紧凑，全大写标签，标题可达 clamp(3rem, 8vw, 9rem) 极大
- **边框**: 3-4px 纯黑实线边框，无圆角（border-radius: 0），所有结构元素外露
- **阴影**: 硬阴影 box-shadow: 6px 6px 0px #1A1A1A（无模糊），hover 时加大偏移 8px 8px
- **色块**: 纯色填充无渐变，强调元素使用整块黄/红/蓝背景色，文字叠加
- **动效**: 快速硬切 200-400ms，cubic-bezier(0.16, 1, 0.3, 1) 弹出感，元素 translate + scale 入场
- **Reveal 系统**: .reveal / .reveal-scale / .reveal-left / .reveal-right + .delay-1~6 交错（每级 100ms）
- **背景**: 米白纯色 + body::before 细网格线（1px rgba 极淡）模拟建筑图纸
- **装饰**: 无花饰无 emoji，装饰性来自结构本身——粗边框、硬阴影、色块、错位
- **卡片**: 4px 黑色边框 + 6px 硬阴影偏移 + hover translate(-2px,-2px) 浮起效果
- **标签**: 方块标签贴纸风格——黄底黑字 2px 边框、Space Mono 等宽大写
- **不对称**: 部分卡片或元素轻微偏移打破网格，制造"手工拼贴"张力
- **进度条**: 顶部 3px 黑色实线进度条，右下角 Space Mono 等宽页码 [01/22]
- **对比/VS**: 粗竖线分隔 + 两侧色块底色（黄 vs 蓝）区分
- **章节过渡**: 巨型 900 字重数字铺底（18vw）+ 粗短横线 + 标题叠加
- **断点**: max-height: 750px / 650px / 500px+landscape, max-width: 768px
- **无障碍**: prefers-reduced-motion 支持
- **JS**: SlidePresentation class，键盘/滚轮/触摸/全览导航，data-count 计数动画
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
    name: "极简中性",
    description: "纯白背景，黑白灰配色，极致留白与尺度对比，适合产品发布",
    previewHtml: generatePreviewHtml(
      "#ffffff",
      "#141414",
      "#141414",
      "极简中性",
      "MINIMAL",
      "light",
    ),
    fullTemplate: templateMinimal,
    styleGuide: minimalStyleGuide,
  },
  {
    id: "corporate",
    name: "商务权威",
    description:
      "深暖灰板岩背景，赤陶色强调，衬线/无衬线双字体系统，适合高端商业报告与咨询演示",
    previewHtml: generatePreviewHtml(
      "#2a2d32",
      "#ece5d8",
      "#c4704a",
      "商务权威",
      "CORPORATE",
      "dark",
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
    description: "深色背景，非对称编辑排版，纯色调层级极简",
    previewHtml: generatePreviewHtml(
      "#0f0e0d",
      "#e8e5e0",
      "#9c9590",
      "暗夜优雅",
      "AXIS",
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
  {
    id: "cyberpunk",
    name: "霓虹赛博朋克",
    description: "暗黑底色，霓虹发光，故障艺术，适合科幻技术主题",
    previewHtml: generatePreviewHtml(
      "#080810",
      "#e0e8ff",
      "#0dff8c",
      "赛博未来",
      "CYBERPUNK",
      "dark",
    ),
    fullTemplate: templateCyberpunk,
    styleGuide: cyberpunkStyleGuide,
  },
  {
    id: "zen",
    name: "禅意东方",
    description: "宣纸质感，墨黑文字，朱红点缀，极简东方美学",
    previewHtml: generatePreviewHtml(
      "#f9f5ec",
      "#1a1a1a",
      "#c0392b",
      "禅意东方",
      "ZEN",
      "light",
    ),
    fullTemplate: templateZen,
    styleGuide: zenStyleGuide,
  },
  {
    id: "watercolor",
    name: "水彩插画",
    description: "水彩晕染背景，柔和粉蓝色调，优雅艺术感",
    previewHtml: generatePreviewHtml(
      "#fefcf7",
      "#3d3535",
      "#f4a8b8",
      "水彩插画",
      "WATERCOLOR",
      "gradient",
    ),
    fullTemplate: templateWatercolor,
    styleGuide: watercolorStyleGuide,
  },
  {
    id: "blueprint",
    name: "蓝图工程",
    description: "工程图纸风格，深蓝底色，黄色标注，适合技术规划",
    previewHtml: generatePreviewHtml(
      "#061020",
      "#d0e4f8",
      "#ffcb00",
      "系统蓝图",
      "BLUEPRINT",
      "dark",
    ),
    fullTemplate: templateBlueprint,
    styleGuide: blueprintStyleGuide,
  },
  {
    id: "brutalism",
    name: "粗野主义",
    description:
      "厚重黑色边框，硬阴影，明黄红蓝撞色，原始结构外露，适合先锋创意与潮流品牌",
    previewHtml: generatePreviewHtml(
      "#FFFDF5",
      "#1A1A1A",
      "#FFE600",
      "粗野主义",
      "BRUTALISM",
      "light",
    ),
    fullTemplate: templateBrutalism,
    styleGuide: brutalismStyleGuide,
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
