import templateExecutive from "@/assets/report/template-executive.html?raw";
import templateTechDoc from "@/assets/report/template-tech-doc.html?raw";
import templateDataDashboard from "@/assets/report/template-data-dashboard.html?raw";
import templateCorporateLight from "@/assets/report/template-corporate-light.html?raw";
import templateResearch from "@/assets/report/template-research.html?raw";
import templateConsulting from "@/assets/report/template-consulting.html?raw";
import templateStartup from "@/assets/report/template-startup.html?raw";
import templateMagazine from "@/assets/report/template-magazine.html?raw";
import templateMinimalReport from "@/assets/report/template-minimal-report.html?raw";
import templateNatureEco from "@/assets/report/template-nature-eco.html?raw";
import templateCapsuleReport from "@/assets/report/template-capsule-report.html?raw";
import templateCyberpunkReport from "@/assets/report/template-cyberpunk-report.html?raw";
import templateRetroAnnual from "@/assets/report/template-retro-annual.html?raw";
import templateGradientGlass from "@/assets/report/template-gradient-glass.html?raw";
import templateBlueprintSpec from "@/assets/report/template-blueprint-spec.html?raw";
import templateNeoBrutalism from "@/assets/report/template-neo-brutalism.html?raw";
import templateCodeDemo from "@/assets/report/template-code-demo.html?raw";
import templateHandwritten from "@/assets/report/template-handwritten.html?raw";
import templateInkPainting from "@/assets/report/template-ink-painting.html?raw";

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  previewHtml: string;
  fullTemplate: string;
  styleGuide: string;
}

const executiveStyleGuide = `
### 视觉风格 (Executive Style - 高管简报)
- **字体**: Google Fonts 导入 Playfair Display（衬线标题 400-700）+ Inter（正文 300-600）+ JetBrains Mono（数据/标签）
- **配色**: 暖白底 #faf9f6，白色卡片 #ffffff，深色文字 #1a1a1a，次要灰 #5c5c5c，金色强调 #a67c00，成功绿 #1a7a4c，危险红 #b91c1c，信息蓝 #1e5f8a
- **排版**: 所有字号使用 clamp()，衬线标题 clamp(2.8rem, 5.5vw, 5rem)，正文 clamp(0.95rem, 1.15vw, 1.1rem)，大量留白，行高 1.75
- **边框**: 1px #e8e4de 柔和分割，强调用金色 rgba(166,124,0,0.2)
- **卡片**: 半透明渐变 rgba(255,255,255,0.7→0.4) + backdrop-filter:blur(12px) + 16px 圆角 + 微阴影 + hover 升浮
- **布局**: 1100px 正文流式布局，居中，大间距 section-gap clamp(4rem, 8vw, 8rem)
- **动效**: 滚动触发 IntersectionObserver，0.7s cubic-bezier(0.16,1,0.3,1)，交错 delay 0.1s 步进
- **图表**: ECharts CDN，浅色主题，金色主线条，柔和面积填充，图表高度 clamp(380px, 50vh, 560px)
- **进度条**: 固定顶部 2px 金色渐变滚动进度条
- **打印**: @media print 去阴影，禁用动画
- **断点**: 768px 单列卡片，480px 单列指标
- **无障碍**: prefers-reduced-motion 支持
- **JS**: ReportPresentation class，reveal + counter + chart + progress bar + back-to-top
`;

const techDocStyleGuide = `
### 视觉风格 (Tech Doc Style - 技术文档)
- **字体**: Google Fonts 导入 JetBrains Mono（等宽主字体 300-600）+ Inter（辅助正文 300-600）
- **配色**: GitHub Dark 风格——深底 #0d1117，面板 #161b22，文字 #c9d1d9，蓝色强调 #58a6ff，绿色 #3fb950，橙色 #d29922，红色 #f85149，紫色 #bc8cff
- **排版**: 等宽字体为主导，所有标题使用 JetBrains Mono，字号 clamp()，正文紧凑 clamp(0.85rem, 1vw, 0.95rem)
- **边框**: 1px rgba(48,54,61,0.8) 暗边框，accent 用 rgba(88,166,255,0.3)
- **代码块**: 深色背景 #161b22 + 顶部语言标签 + 手动语法着色 class（.keyword .string .function .type .comment）
- **状态徽章**: 小圆角 3px 胶囊，彩色文字 + 同色 12% 透明背景（green-dim, orange-dim, red-dim, purple-dim）
- **section-label**: 前缀 "/// " 绿色注释风格
- **section-title**: 前缀 "> " 蓝色终端提示符风格
- **动效**: 简洁快速 0.5s ease-out，交错 0.08s 步进，无弹性
- **图表**: ECharts CDN，暗色主题，等宽字体轴标签，低饱和颜色
- **布局**: 960px 窄容器（技术文档阅读宽度），居中，无侧边导航
- **打印**: @media print 白底，代码块保留边框
- **断点**: 768px 单列
- **无障碍**: prefers-reduced-motion 支持
- **JS**: ReportPresentation class，reveal + counter + chart + progress bar + back-to-top
`;

const dataDashboardStyleGuide = `
### 视觉风格 (Data Dashboard Style - 数据仪表盘 · Observatory 暗色主题)
- **字体**: Google Fonts 导入 Manrope（几何无衬线 300-800）+ Source Code Pro（等宽数据字体 400-700）
- **配色**: OKLCH 色彩空间——深底 oklch(0.13 0.008 250)，面板 oklch(0.16 0.01 250)，次面板 oklch(0.19 0.012 250)，边框 oklch(0.25 0.01 250)，文字 oklch(0.93 0.008 250)，次要文字 oklch(0.65 0.01 250)，暗文字 oklch(0.45 0.01 250)，主色暖琥珀 oklch(0.75 0.18 55)，成功色 oklch(0.72 0.17 155)，警告色 oklch(0.75 0.15 80)，危险色 oklch(0.65 0.2 25)
- **排版**: 所有字号 clamp()，Manrope 800 标题 letter-spacing:-0.02em，Source Code Pro 数据数字，正文 line-height 1.65，暗底文字加大行高
- **背景**: 深色底 + fixed 点阵网格背景（radial-gradient 1px 圆点，32px 间距，0.3 opacity）——数据图纸质感
- **面板**: 深色面板 + 1px 边框 + 6px 小圆角，hover 时边框变琥珀色 + 微弱辉光 + translateY(-2px)
- **封面**: 深色面板，顶部 2px 琥珀色条，左对齐标题，琥珀色脉冲圆点动画表示实时
- **指标卡**: 非对称 6 列网格（span-2 和 span-1 交替），小色点取代 emoji 图标，卡片内含迷你 sparkline 图表
- **图表**: ECharts CDN，透明背景，琥珀色主线，深色网格线 dashed，dark tooltip，1.2s cubicOut 动画
- **表格**: 深色面板包裹，thead 最深背景 + uppercase 小字 + 加大字距，hover 行用 surface-alt 色
- **进度条**: 4px 高度，填充后末端带发光圆点效果
- **徽章/Badge**: 3px 圆角胶囊，彩色文字 + 12% 同色背景，等宽字体
- **提示框/Callout**: 深色面板 + 3px 宽竖线色条（取代 emoji），文字次要色
- **洞察卡**: 深色面板 + 8px 方形色块指示器，hover 时边框加深
- **布局**: 1180px 容器，非对称网格（3:2 图表分割，表格+侧边栏卡片并排），固定左侧圆点导航
- **导航**: 固定左侧 section-nav 圆点，active 状态为琥珀色 + 辉光，hover 显示标签
- **section header**: 底部 1px 边框，进入视口时出现 60px 琥珀色下划线动画
- **打印**: @media print 去背景点阵/导航/进度条，白底深色文字
- **断点**: 1024px 4 列指标 + 隐藏侧导航，768px 2 列 + 单列图表，480px 全单列
- **无障碍**: prefers-reduced-motion 去动画和 transform
- **JS**: ReportPresentation class，reveal + reveal-left + reveal-right + counter(expo-out) + sparkline + chart + progress bar + section-nav + back-to-top + scroll-progress
`;

const corporateLightStyleGuide = `
### 视觉风格 (Corporate Light Style - 商务白皮书)
- **字体**: Source Serif 4（衬线标题）+ Work Sans（正文）+ Fira Code（数据）
- **配色**: 纯白底 #ffffff，淡灰面板 #f8f9fa，深蓝文字 #1a2b4a，专业蓝强调 #2563eb，次要灰 #6b7280
- **排版**: 衬线标题对比无衬线正文，严肃商务感，clamp() 响应式字号
- **风格**: 结构化章节，编号标题，清晰的信息层级，适合打印
- **组件**: 摘要框、表格、引用块、编号列表、KPI 卡片
`;

const researchStyleGuide = `
### 视觉风格 (Research Style - 学术研究)
- **字体**: Crimson Pro（衬线正文）+ Inter（标题/界面）+ JetBrains Mono（数据）
- **配色**: 米白 #fffef9，深墨文字 #2c3e50，学术蓝 #1a5f7a，引用灰 #6c757d
- **排版**: 两端对齐，1.8 行高，脚注，引用标记，参考文献格式
- **风格**: 论文风格布局，摘要/关键词区，章节编号，公式区域
- **组件**: 引文块、数据表、图注、参考文献列表、脚注
`;

const consultingStyleGuide = `
### 视觉风格 (Consulting Style - 咨询报告)
- **字体**: Outfit（现代标题）+ Inter（正文）+ Space Mono（数据）
- **配色**: 白底 #ffffff，深蓝框架 #0f2b5b，红色强调 #e63946，灰色正文 #4a5568
- **排版**: 双栏布局为主，洞察框突出，简洁数据可视化
- **风格**: 麦肯锡/BCG 风格，金字塔原则，MECE 结构
- **组件**: 洞察框、矩阵图、瀑布图、桥接图、优先级矩阵
`;

const startupStyleGuide = `
### 视觉风格 (Startup Style - 创业融资)
- **字体**: Sora（现代几何标题 600-800）+ Inter（正文）
- **配色**: 深色底 #0f0f23，渐变强调（violet→fuchsia→cyan），白文字，亮色数据
- **排版**: 大胆数字展示 clamp(3rem, 8vw, 6rem)，最小正文，数据优先
- **风格**: 投资者友好，关键指标突出，增长曲线，市场规模可视化
- **组件**: 巨型指标、增长图表、TAM/SAM/SOM 漏斗、里程碑时间轴
`;

const magazineStyleGuide = `
### 视觉风格 (Magazine Style - 杂志风格)
- **字体**: Fraunces（编辑衬线标题）+ Lora（正文衬线）+ Inter（界面）
- **配色**: 温暖白 #fdfbf7，编辑黑 #1a1a1a，朱砂红 #c23616，金 #b8860b
- **排版**: 多列排版（2-3列），大写标题，pull quote，drop cap 首字母
- **风格**: 编辑出版物感，大标题冲击，图文混排，分栏
- **组件**: 大字引用、栏目分隔、图片说明、侧边栏注释
`;

const minimalReportStyleGuide = `
### 视觉风格 (Minimal Report Style - 极简报告 · 杂志编辑美学)
- **字体**: Playfair Display（衬线标题 400/italic）+ Manrope（正文 300-500）
- **配色**: 暖纸白 #f8f5f0，暖黑 #1a1a18，暖灰 #9a9590，浅暖灰 #d4cfc8，赤陶强调 #c8553d
- **排版**: 12列不对称网格，章节标记左置窄栏，正文居中偏左，引用右偏移，统计数字宽幅展示
- **风格**: Kinfolk/Cereal Magazine 编辑美学，大面积留白，不对称构图，印刷品质感
- **组件**: italic 大号统计数字（横排）+ 短线分隔、无边框表格、上方短线引用块、垂直滚动进度条
- **图表**: ECharts CDN，smooth: 0.3 曲线，1.5px 线宽，无圆点标记，极淡渐变填充
- **动效**: IntersectionObserver，translateY(20px) + opacity 渐入，cubic-bezier(0.16, 1, 0.3, 1)
- **断点**: 1024px 网格简化 / 768px 单列 block 布局
- **无障碍**: prefers-reduced-motion 支持
`;

const natureEcoStyleGuide = `
### 视觉风格 (Nature Eco Style - 自然生态)
- **字体**: Nunito Sans（圆润正文）+ Fraunces（有机衬线标题）
- **配色**: 暖亚麻 #f9f6f0，森林绿 #2d5a27，鼠尾草 #7c9a6e，泥土棕 #8b6914，溪水蓝 #4a8b9e
- **排版**: 圆润无衬线正文，有机间距，16px 圆角
- **风格**: 可持续发展主题，有机形状背景，自然调色板
- **组件**: 圆角卡片、有机形状装饰、生态指标、绿色进度条
`;

const capsuleReportStyleGuide = `
### 视觉风格 (Capsule Report Style - 胶囊信号报告)
- **字体**: Google Fonts 导入 Albert Sans（英文/数据）+ Noto Sans SC（中文正文），标题使用 800 字重形成直接、清晰的报告语气
- **配色**: 暖纸底 #f7f2e8，墨黑 #22211f，薄荷绿 #73d99f，珊瑚红 #ff7d66，电光蓝 #5268ff，柠檬黄 #f5d858，淡紫 #b9a0ff
- **排版**: 左对齐为主，封面非对称双栏，正文采用章节索引 + 内容区结构；不对标题和描述做局部 max-width 限制
- **胶囊系统**: 胶囊用于报告标识、数据标签、状态、进度条、画像占比、路线图阶段，不作为每节标题上方的重复装饰
- **边框**: 1.5px 墨黑描边，胶囊圆角 999px，卡片圆角 8px，避免过大圆角导致报告感变弱
- **背景**: 暖纸色 + 36px 细网格，提供轻微结构感但不抢正文
- **布局**: 1440px 最大外壳，section 使用 190px+内容区的稳定网格；触点诊断使用横向任务链，避免不对称左右拼贴造成错乱
- **图表**: ECharts CDN，透明背景，黑色描边糖果色数据，柱状图圆角胶囊化，图表旁保留文字解释
- **内容结构**: 产品体验信号报告样例，包含执行摘要、健康指标、用户分层、触点诊断、渠道留存、策略结构、路线图、风险治理、研究方法
- **动效**: IntersectionObserver 渐入，顶部彩色胶囊进度条，胶囊返回顶部按钮
- **断点**: 1080px 关键网格转单列，780px 章节索引转横向，520px 胶囊装饰栅格简化
- **打印**: 去除固定控件与阴影，保留内容结构和图表容器
- **无障碍**: back-to-top aria-label，prefers-reduced-motion 禁用动画
`;

const cyberpunkReportStyleGuide = `
### 视觉风格 (Cyberpunk Report Style - 赛博分析)
- **字体**: Space Grotesk（未来标题）+ Inter（正文）+ JetBrains Mono（数据/终端）
- **配色**: 纯黑 #0a0a0a，霓虹绿 #00ff88，电粉 #ff0080，紫蓝 #6c5ce7，扫描线纹理
- **排版**: 等宽数据展示，故障效果文字，边框发光
- **风格**: 赛博朋克/黑客终端美学，数据矩阵，全息感
- **组件**: 终端代码块、霓虹边框卡片、故障文字效果、扫描线覆盖
`;

const retroAnnualStyleGuide = `
### 视觉风格 (Retro Annual Style - 复古年报)
- **字体**: Playfair Display（复古衬线标题）+ Lato（正文）+ Courier Prime（数据）
- **配色**: 暖纸 #f5f0e8，深棕 #3d2b1f，铜金 #b87333，暗红 #8b2500，藏蓝 #1b3a5c
- **排版**: 传统年报排版，衬线正式感，罗马数字章节
- **风格**: 80 年代年报美学，装饰线条，vintage 边框
- **组件**: 复古边框表格、装饰性章节分割、铜色统计数字
`;

const gradientGlassStyleGuide = `
### 视觉风格 (Gradient Glass Style - 玻璃流光)
- **字体**: Satoshi / General Sans（现代几何标题）+ Inter（正文）
- **配色**: 深底 #0f0f1a，动态渐变背景（purple→blue→pink 15-20s 循环），白文字，毛玻璃面板
- **排版**: 现代 SaaS 风格，大号展示文字，圆润设计
- **风格**: Glassmorphism 毛玻璃 + 动态渐变背景，现代感强
- **组件**: 毛玻璃卡片 backdrop-filter:blur(20px)、渐变边框、发光按钮
`;

const blueprintSpecStyleGuide = `
### 视觉风格 (Blueprint Spec Style - 蓝图规格)
- **字体**: Source Code Pro（等宽主字体）+ Inter（正文）
- **配色**: 工程蓝 #1a3a5c，网格蓝 #2a4a7c，标注黄 #ffd700，白文字 #e8f0fe
- **排版**: 工程图纸风格，双网格背景（80px 主 + 20px 细），标注式注释
- **风格**: 技术蓝图/工程规格书美学，精确标注，坐标参考
- **组件**: 网格背景、标注框、尺寸线、规格表格、警告标识
`;

const neoBrutalismStyleGuide = `
### 视觉风格 (Neo-Brutalism Style - 新粗野主义)
- **字体**: Space Grotesk（展示标题 800-900）+ Inter（正文 300-500）+ Space Mono（数据/等宽）
- **配色**: 暖纸底 #FFFDF5，纯黑边框 #1A1A1A，强调黄 #FFE600，红 #FF3333，蓝 #2E4CFF，绿 #00CC66
- **排版**: 全大写标题，超粗字重 800-900，紧凑行高，无衬线主导
- **边框**: 3-4px solid #1A1A1A，绝对不使用 border-radius（所有元素直角）
- **阴影**: 硬偏移 6px 6px 0px #1A1A1A（无模糊），hover 时加大偏移
- **背景**: body::before 40px 网格纹理（极淡灰线条）
- **卡片**: 黑色粗边框 + 硬阴影 + 顶部 6px 彩色条带（yellow/red/blue/green）
- **高亮**: 内联 span 背景色块（黄底默认，红/蓝变体）
- **图表**: ECharts CDN，阶梯线/折线无平滑，粗 3px 描边，rect 符号，黑色边框
- **布局**: 1000px 容器居中，大间距 section
- **动效**: IntersectionObserver 滚动触发，0.4s ease-out
- **打印**: @media print 去阴影去网格
- **断点**: 768px / 480px
- **无障碍**: prefers-reduced-motion 支持
`;

const codeDemoStyleGuide = `
### 视觉风格 (Code Demo Style - 代码演示)
- **字体**: JetBrains Mono（代码/主界面 400-700）+ Inter（注释正文 300-500）
- **配色**: Tokyo Night 暗色主题——页面底 #1a1b26，代码面板 #13141b，注释面板 #1e1f2e，文字 #a9b1d6，标题 #c0caf5，蓝 #7aa2f7，绿 #9ece6a，紫 #bb9af7，橙 #ff9e64，红 #f7768e，青 #7dcfff
- **排版**: 等宽字体为代码主导，正文用 Inter 无衬线，clamp() 响应字号
- **核心特性**: CodeHike 风格滚动叙事——左侧 sticky 代码面板 + 右侧滚动注释块
- **代码面板**: 终端风格头部（红/黄/绿圆点 + 文件名），行号左侧，当前高亮行有左侧蓝色边框 + 背景色
- **语法高亮**: CSS 类驱动（.token-keyword 紫, .token-string 绿, .token-function 蓝, .token-number 橙, .token-comment 灰斜体, .token-type 青）
- **滚动叙事**: IntersectionObserver 监听注释步骤，激活时更新代码面板的行高亮
- **图表**: ECharts CDN，暗色主题，与代码配色协调
- **布局**: 1200px 宽容器（代码+注释并排需要更宽），滚动叙事区域 grid 布局
- **动效**: 行高亮 0.3s 过渡，reveal 动画 0.5s ease-out
- **打印**: @media print 切换为浅色背景
- **响应式**: < 768px 滚动叙事从并排改为上下堆叠
- **无障碍**: prefers-reduced-motion 支持
`;

const handwrittenStyleGuide = `
### 视觉风格 (Handwritten Style - 手写体风格)
- **字体**: ZCOOL KuaiLe（展示标题）+ Ma Shan Zheng（中文手写）+ Patrick Hand（英文手写正文）+ Architects Daughter（替代草书）
- **配色**: 笔记本纸 #fdf8f0，墨水黑 #3d2c2c，粉色 #f4a0b0，薄荷 #a0dcc8，天蓝 #a8c8e8，奶黄 #fdf5d6，薰衣草 #c8b0e0，蜜桃 #f8c8a0
- **排版**: 手写体为主导，标题微旋转 -1~2deg，行高 1.9，手工感间距
- **背景**: 笔记本横线纸（repeating-linear-gradient 水平线，~28px 间距，极淡蓝色）+ 左侧红色页边线
- **卡片**: 圆角 12-20px，柔和粉彩背景，顶部胶带装饰，微旋转 1-2deg 手工放置感
- **装饰**: 和纸胶带（.washi 半透明色条 + 微旋转）、贴纸徽章（圆角胶囊 emoji+文字）、涂鸦下划线
- **高亮**: 荧光笔风格 gradient underline（\`background: linear-gradient(180deg, transparent 60%, color 60%)\`）
- **图表**: ECharts CDN，圆角柱状图，粉彩色系，柔和网格线
- **布局**: 800px 窄容器（笔记本宽度），居中
- **动效**: IntersectionObserver 滚动触发，轻柔上浮 0.55s
- **进度条**: 彩虹渐变（pink→mint→sky）
- **打印**: @media print 去旋转去阴影
- **断点**: 768px / 480px
- **无障碍**: prefers-reduced-motion 支持
`;

const inkPaintingStyleGuide = `
### 视觉风格 (Ink Painting Style - 水墨画风格)
- **字体**: Noto Serif SC（宋体正文 300-900）+ LXGW WenKai（楷书标题/注释 300-700）+ Ma Shan Zheng（行书引用）+ Zhi Mang Xing（草书封面/数字）
- **配色**: 墨分五色体系——宣纸底 #f5f0e8，浓墨 #0d0d0d，淡墨 rgba(20,20,20,0.5)，干墨 #2a2520，湿墨 rgba(15,15,15,0.35)，焦墨 #000；朱砂 #bf3a2b（仅用于印章和高亮标记）
- **排版**: 宋体正文 line-height 2.0，楷书标题 letter-spacing 0.2em；字号层次通过墨色浓淡+字重区分
- **竖排文字**: 诗句引用和侧边注释使用 writing-mode: vertical-rl，封面诗文竖排居中
- **印章**: 朱红方块 + filter: url(#seal-wear) SVG 滤镜做残破磨损边缘，盖印动画（scale 1.3→0.94→1）
- **SVG 滤镜系统**: 隐藏 SVG defs 定义 5 个滤镜——paper-texture（宣纸纤维 feTurbulence）、ink-bleed（墨迹晕染 feDisplacementMap）、seal-wear（印章磨损）、ink-wash（背景淡墨）、brush-rough（笔触粗糙）
- **宣纸纹理**: 全屏固定 SVG rect + feTurbulence(fractalNoise, baseFreq 0.9, octaves 4)，极淡覆盖
- **山水背景**: 固定底部 SVG 多层山脉剪影 path（3层不同透明度 0.025/0.018/0.012）
- **分割线**: SVG path 有机笔触 + filter: url(#brush-rough)，3-4 个不同曲率变体，stroke-linecap round
- **墨色晕染**: 封面 SVG ellipse + filter: url(#ink-wash) 模拟真实墨色扩散
- **装饰元素**: 墨点飞溅 SVG（opacity 0.04）、竹影线描、梅枝线描、祥云纹、墨滴
- **图表**: ECharts CDN，transparent 底，朱红主数据线+淡墨辅助线，圆角柱状图
- **布局**: 960px 容器，疏密交替——大章节间距 8-14rem（意境、传承），紧凑章节 4rem（笔墨）
- **动效**: IntersectionObserver 触发——墨迹显现（opacity + scale 0.97→1 + blur 2px→0，1.2s）；SVG stroke-dasharray 笔触绘制动画（2s）；印章盖印动画（0.6s）；stagger 子元素延迟
- **进度条**: 1px 极细线 rgba(26,26,26,0.4)
- **打印**: @media print 去除所有 SVG 装饰/滤镜/动画/固定元素
- **断点**: 768px（隐藏竖排文字和侧边装饰，网格回退单列）
- **无障碍**: prefers-reduced-motion 去除所有动画和过渡
`;

const generatePreviewHtml = (
  bgColor: string,
  textColor: string,
  accentColor: string,
  title: string,
  subtitle: string,
): string => {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: ${bgColor};
  color: ${textColor};
  font-family: system-ui, -apple-system, sans-serif;
  width: 100vw; height: 100vh;
  display: flex; flex-direction: column;
  justify-content: center; align-items: center;
  text-align: center; padding: 20px;
}
.title {
  font-size: 18px; font-weight: 600;
  margin-bottom: 8px;
}
.subtitle {
  font-size: 11px; opacity: 0.6;
  letter-spacing: 0.08em; text-transform: uppercase;
}
.accent-line {
  width: 32px; height: 2px;
  background: ${accentColor};
  margin: 12px auto 0;
}
.bars {
  display: flex; gap: 4px; margin-top: 16px; align-items: flex-end; height: 30px;
}
.bar {
  width: 8px; border-radius: 2px;
  background: ${accentColor}; opacity: 0.6;
}
</style>
</head>
<body>
<div class="title">${title}</div>
<div class="subtitle">${subtitle}</div>
<div class="accent-line"></div>
<div class="bars">
  <div class="bar" style="height:12px"></div>
  <div class="bar" style="height:20px"></div>
  <div class="bar" style="height:28px"></div>
  <div class="bar" style="height:18px"></div>
  <div class="bar" style="height:24px"></div>
</div>
</body>
</html>`;
};

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "executive",
    name: "高管简报",
    description: "暖白底金色调，衬线标题，大留白，适合高层汇报与战略报告",
    previewHtml: generatePreviewHtml(
      "#faf9f6",
      "#1a1a1a",
      "#a67c00",
      "高管简报",
      "EXECUTIVE",
    ),
    fullTemplate: templateExecutive,
    styleGuide: executiveStyleGuide,
  },
  {
    id: "corporate-light",
    name: "商务白皮书",
    description: "浅色底，专业蓝，结构化章节，适合正式商务报告",
    previewHtml: generatePreviewHtml(
      "#ffffff",
      "#1a2b4a",
      "#2563eb",
      "商务白皮书",
      "CORPORATE",
    ),
    fullTemplate: templateCorporateLight,
    styleGuide: corporateLightStyleGuide,
  },
  {
    id: "data-dashboard",
    name: "数据仪表盘",
    description: "暗色深底琥珀强调，点阵背景，非对称密集网格，适合数据分析报告",
    previewHtml: generatePreviewHtml(
      "#1a1f2e",
      "#edf0f7",
      "#d4890a",
      "数据仪表盘",
      "DASHBOARD",
    ),
    fullTemplate: templateDataDashboard,
    styleGuide: dataDashboardStyleGuide,
  },
  {
    id: "research",
    name: "学术研究",
    description: "米白背景，衬线字体，引注脚注，适合学术论文与研究报告",
    previewHtml: generatePreviewHtml(
      "#fffef9",
      "#2c3e50",
      "#1a5f7a",
      "学术研究",
      "RESEARCH",
    ),
    fullTemplate: templateResearch,
    styleGuide: researchStyleGuide,
  },
  {
    id: "consulting",
    name: "咨询报告",
    description: "麦肯锡风格，双栏布局，洞察框，适合战略咨询与分析报告",
    previewHtml: generatePreviewHtml(
      "#ffffff",
      "#0f2b5b",
      "#e63946",
      "咨询报告",
      "CONSULTING",
    ),
    fullTemplate: templateConsulting,
    styleGuide: consultingStyleGuide,
  },
  {
    id: "tech-doc",
    name: "技术文档",
    description: "等宽代码风格，终端美学，暗色主题，适合技术方案与架构设计",
    previewHtml: generatePreviewHtml(
      "#0d1117",
      "#c9d1d9",
      "#58a6ff",
      "技术文档",
      "TECH DOC",
    ),
    fullTemplate: templateTechDoc,
    styleGuide: techDocStyleGuide,
  },
  {
    id: "startup",
    name: "创业融资",
    description: "大胆渐变，大号指标，增长曲线，适合投资人汇报",
    previewHtml: generatePreviewHtml(
      "#0f0f23",
      "#ffffff",
      "#a855f7",
      "创业融资",
      "STARTUP",
    ),
    fullTemplate: templateStartup,
    styleGuide: startupStyleGuide,
  },
  {
    id: "magazine",
    name: "杂志风格",
    description: "多列排版，编辑出版物感，图文混排，适合内容营销报告",
    previewHtml: generatePreviewHtml(
      "#fdfbf7",
      "#1a1a1a",
      "#c23616",
      "杂志风格",
      "MAGAZINE",
    ),
    fullTemplate: templateMagazine,
    styleGuide: magazineStyleGuide,
  },
  {
    id: "minimal-report",
    name: "极简报告",
    description: "杂志编辑美学，不对称网格，暖色纸张质感，适合高端季度报告",
    previewHtml: generatePreviewHtml(
      "#f8f5f0",
      "#1a1a18",
      "#c8553d",
      "极简报告",
      "MINIMAL",
    ),
    fullTemplate: templateMinimalReport,
    styleGuide: minimalReportStyleGuide,
  },
  {
    id: "nature-eco",
    name: "自然生态",
    description: "泥土色调，有机形状，可持续主题，适合 ESG 与环境报告",
    previewHtml: generatePreviewHtml(
      "#f9f6f0",
      "#2d5a27",
      "#7c9a6e",
      "自然生态",
      "ECO",
    ),
    fullTemplate: templateNatureEco,
    styleGuide: natureEcoStyleGuide,
  },
  {
    id: "capsule-report",
    name: "胶囊信号",
    description:
      "暖纸底、糖果色胶囊编码、稳定报告网格，适合产品体验、用户洞察与策略分析报告",
    previewHtml: generatePreviewHtml(
      "#f7f2e8",
      "#22211f",
      "#ff7d66",
      "胶囊信号",
      "CAPSULE",
    ),
    fullTemplate: templateCapsuleReport,
    styleGuide: capsuleReportStyleGuide,
  },
  {
    id: "cyberpunk-report",
    name: "赛博分析",
    description: "霓虹暗底，故障效果，黑客终端风格，适合科技与安全报告",
    previewHtml: generatePreviewHtml(
      "#0a0a0a",
      "#00ff88",
      "#ff0080",
      "赛博分析",
      "CYBER",
    ),
    fullTemplate: templateCyberpunkReport,
    styleGuide: cyberpunkReportStyleGuide,
  },
  {
    id: "retro-annual",
    name: "复古年报",
    description: "暖纸色调，复古装饰，年度回顾风格，适合年度总结报告",
    previewHtml: generatePreviewHtml(
      "#f5f0e8",
      "#3d2b1f",
      "#b87333",
      "复古年报",
      "ANNUAL",
    ),
    fullTemplate: templateRetroAnnual,
    styleGuide: retroAnnualStyleGuide,
  },
  {
    id: "gradient-glass",
    name: "玻璃流光",
    description: "毛玻璃效果，动态渐变背景，现代 SaaS 风格，适合产品报告",
    previewHtml: generatePreviewHtml(
      "#0f0f1a",
      "#ffffff",
      "#818cf8",
      "玻璃流光",
      "GLASS",
    ),
    fullTemplate: templateGradientGlass,
    styleGuide: gradientGlassStyleGuide,
  },
  {
    id: "blueprint-spec",
    name: "蓝图规格",
    description: "工程蓝底，网格线，标注式注释，适合技术规格与系统设计",
    previewHtml: generatePreviewHtml(
      "#1a3a5c",
      "#e8f0fe",
      "#ffd700",
      "蓝图规格",
      "BLUEPRINT",
    ),
    fullTemplate: templateBlueprintSpec,
    styleGuide: blueprintSpecStyleGuide,
  },
  {
    id: "neo-brutalism",
    name: "新粗野主义",
    description:
      "厚重黑框，硬偏移阴影，撞色高亮，网格纹理，适合设计系统与产品方案",
    previewHtml: generatePreviewHtml(
      "#FFFDF5",
      "#1A1A1A",
      "#FFE600",
      "新粗野主义",
      "BRUTAL",
    ),
    fullTemplate: templateNeoBrutalism,
    styleGuide: neoBrutalismStyleGuide,
  },
  {
    id: "code-demo",
    name: "代码演示",
    description:
      "暗色代码主题，CodeHike 滚动叙事，行高亮联动，适合算法讲解与 API 文档",
    previewHtml: generatePreviewHtml(
      "#1a1b26",
      "#a9b1d6",
      "#7aa2f7",
      "代码演示",
      "CODE",
    ),
    fullTemplate: templateCodeDemo,
    styleGuide: codeDemoStyleGuide,
  },
  {
    id: "handwritten",
    name: "手写笔记",
    description:
      "笔记本纸纹理，手写字体，和纸胶带装饰，粉彩配色，适合个人总结与轻松报告",
    previewHtml: generatePreviewHtml(
      "#fdf8f0",
      "#3d2c2c",
      "#f4a0b0",
      "手写笔记",
      "NOTE",
    ),
    fullTemplate: templateHandwritten,
    styleGuide: handwrittenStyleGuide,
  },
  {
    id: "ink-painting",
    name: "水墨丹青",
    description:
      "宣纸底色，楷书标题，朱砂印章，水墨晕染，适合文化主题与高雅报告",
    previewHtml: generatePreviewHtml(
      "#f8f5f0",
      "#1a1a1a",
      "#c23b22",
      "水墨丹青",
      "INK",
    ),
    fullTemplate: templateInkPainting,
    styleGuide: inkPaintingStyleGuide,
  },
];

export const DEFAULT_REPORT_TEMPLATE_ID = "executive";

export const getReportTemplateById = (
  id: string,
): ReportTemplate | undefined => {
  return REPORT_TEMPLATES.find((t) => t.id === id);
};

export const getDefaultReportTemplate = (): ReportTemplate => {
  return (
    REPORT_TEMPLATES.find((t) => t.id === DEFAULT_REPORT_TEMPLATE_ID) ??
    REPORT_TEMPLATES[0]
  );
};
