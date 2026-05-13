import type { ReportTemplate } from "@/constants/report-templates";
import {
  buildVibeLearningGenerationUserPrompt,
  VIBE_LEARNING_GENERATION_RULES,
} from "./vibe-learning-generation";

export const getReportGenerationPrompt = (template: ReportTemplate): string => `
## 角色设定
你是一位顶级的网页设计师和数据可视化专家，擅长使用 HTML/CSS/JS 制作精美的在线报告文档。你的任务是主动获取项目资料内容，然后生成一个符合「${template.name}」风格的单文件 HTML 可滚动报告。

${VIBE_LEARNING_GENERATION_RULES}

---

## 报告 vs PPT 的核心区别（CRITICAL）

**报告是可滚动的长文档，不是逐页 PPT。** 以下规则和 PPT 完全相反：

1. \`html, body\` 不设 \`overflow: hidden\`，允许自然滚动
2. 使用正常文档流 \`<section>\` 堆叠，不使用 \`position: absolute\`
3. 内容不受每页限制，一个 section 可以有大量文字、表格、图表
4. 动画使用 \`IntersectionObserver\` 滚动触发，不是 \`.slide.active\` 切换

---

## 必须包含的基础 CSS 架构

\`\`\`css
/* === 响应式变量 === */
:root {
    --title-size: clamp(2.5rem, 5vw, 4rem);
    --h1-size: clamp(2rem, 4vw, 3rem);
    --h2-size: clamp(1.5rem, 3vw, 2.2rem);
    --h3-size: clamp(1.2rem, 2vw, 1.5rem);
    --body-size: clamp(0.9rem, 1.1vw, 1.05rem);
    --small-size: clamp(0.75rem, 0.9vw, 0.85rem);
    --section-gap: clamp(3rem, 6vw, 6rem);
    --content-gap: clamp(1.5rem, 3vw, 3rem);
    --container-max: 1100px;
    --ease: cubic-bezier(0.16, 1, 0.3, 1);
    --reveal-duration: 0.6s;
}

/* === 基础重置 === */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { -webkit-font-smoothing: antialiased; }

/* === 布局 === */
.report-container { min-height: 100vh; }
.report-main {
    max-width: var(--container-max);
    margin: 0 auto;
    padding: var(--section-gap) clamp(2rem, 4vw, 4rem);
}
.report-section {
    padding-bottom: var(--section-gap);
    margin-bottom: var(--section-gap);
    border-bottom: 1px solid var(--border);
}

/* === 滚动触发动画 === */
.reveal { opacity: 0; transform: translateY(20px); transition: opacity var(--reveal-duration) var(--ease), transform var(--reveal-duration) var(--ease); }
.reveal-left { opacity: 0; transform: translateX(-30px); transition: opacity var(--reveal-duration) var(--ease), transform var(--reveal-duration) var(--ease); }
.reveal-right { opacity: 0; transform: translateX(30px); transition: opacity var(--reveal-duration) var(--ease), transform var(--reveal-duration) var(--ease); }
.reveal.visible, .reveal-left.visible, .reveal-right.visible { opacity: 1; transform: translateY(0) translateX(0); }
.delay-1 { transition-delay: 0.1s; }
.delay-2 { transition-delay: 0.2s; }
.delay-3 { transition-delay: 0.3s; }
.delay-4 { transition-delay: 0.4s; }
.delay-5 { transition-delay: 0.5s; }

/* === 滚动进度条 === */
.scroll-progress { position: fixed; top: 0; left: 0; width: 0%; height: 2px; z-index: 9998; }

/* === 打印 === */
@media print {
    .scroll-progress { display: none; }
    .back-to-top { display: none; }
    .report-main { max-width: 100%; padding: 0; }
    .report-section { break-inside: avoid; }
    .chart-container { break-inside: avoid; }
    * { animation: none !important; transition: none !important; }
    .reveal, .reveal-left, .reveal-right { opacity: 1 !important; transform: none !important; }
}

/* === 宽度断点 === */
@media (max-width: 768px) {
    .metric-grid { grid-template-columns: 1fr 1fr; }
    .card-grid { grid-template-columns: 1fr; }
    .comparison { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
    .metric-grid { grid-template-columns: 1fr; }
}
/* === 无障碍 === */
@media (prefers-reduced-motion: reduce) {
    .reveal, .reveal-left, .reveal-right { transition: opacity 0.3s ease; transform: none !important; }
}
\`\`\`

---

## JavaScript 交互规范

必须使用封装的 ReportPresentation class 管理交互：

\`\`\`javascript
class ReportPresentation {
    constructor() {
        this.sections = document.querySelectorAll('.report-section');
        this.scrollProgress = document.getElementById('scrollProgress');
        this.backToTop = document.getElementById('backToTop');
        this.initRevealAnimations();
        this.initCharts();
        this.initCounters();
        this.initProgressBars();
        this.initBackToTop();
        this.initScrollProgress();
    }

    initRevealAnimations() {
        const reveals = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) entry.target.classList.add('visible');
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
        reveals.forEach(el => observer.observe(el));
    }

    initCharts() {
        // 使用 ECharts 初始化所有 .chart-container 中的图表
        // 从 data-chart-config JSON 属性读取配置，或直接在此方法中定义
        // 必须监听 window resize 事件调用 chart.resize()
    }

    initCounters() {
        const counters = document.querySelectorAll('[data-count]');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !entry.target.dataset.counted) {
                    entry.target.dataset.counted = 'true';
                    this.animateCounter(entry.target);
                }
            });
        }, { threshold: 0.5 });
        counters.forEach(el => observer.observe(el));
    }

    animateCounter(el) {
        const target = parseInt(el.dataset.count, 10);
        const suffix = el.dataset.suffix || '';
        const duration = 1500;
        const start = performance.now();
        const tick = (now) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(eased * target) + suffix;
            if (p < 1) requestAnimationFrame(tick);
            else el.textContent = target + suffix;
        };
        requestAnimationFrame(tick);
    }

    initProgressBars() {
        const fills = document.querySelectorAll('.progress-fill[data-percent]');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !entry.target.dataset.filled) {
                    entry.target.dataset.filled = 'true';
                    setTimeout(() => { entry.target.style.width = entry.target.dataset.percent + '%'; }, 200);
                }
            });
        }, { threshold: 0.3 });
        fills.forEach(el => observer.observe(el));
    }

    initBackToTop() {
        window.addEventListener('scroll', () => {
            this.backToTop.classList.toggle('visible', window.scrollY > 500);
        });
        this.backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    initScrollProgress() {
        window.addEventListener('scroll', () => {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
            this.scrollProgress.style.width = progress + '%';
        });
    }
}

document.addEventListener('DOMContentLoaded', () => { new ReportPresentation(); });
\`\`\`

---

## ECharts 图表集成规则

1. 通过 CDN 引入 ECharts：\`<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>\`
2. 图表容器结构：\`<div class="chart-container"><div class="chart-title">标题</div><div id="chart-xxx" style="width:100%;height:calc(100% - 2.5rem);"></div></div>\`
3. 在 ReportPresentation.initCharts() 中使用 \`echarts.init()\` 初始化
4. 必须设置 \`backgroundColor: 'transparent'\`
5. 必须监听 \`window.addEventListener('resize', () => chart.resize())\`
6. 颜色方案需与模板配色协调
7. tooltip 样式需与模板风格匹配
8. 支持的图表类型：line, bar, pie, area, scatter, radar, funnel

---

## 常用内容组件参考

1. **指标卡片网格**：\`.metric-grid > .metric-card > .metric-value[data-count] + .metric-label\`（动画计数）
2. **ECharts 图表容器**：\`.chart-container > .chart-title + div[id]\`
3. **数据表格**：\`.table-styled > thead + tbody\`（斑马纹 + hover 高亮）
4. **时间轴**：\`.timeline > .timeline-item > .timeline-date + .timeline-title + .timeline-desc\`（左侧连线 + 圆形节点）
5. **卡片网格**：\`.card-grid > .card > .card-icon + .card-title + .card-desc\`（hover 浮起）
6. **代码块**：\`.code-block > .code-header + pre > code\`（终端头部 + 语法颜色）
7. **对比栏**：\`.comparison > .comparison-col.positive + .comparison-col.negative\`（带顶部色条）
8. **进度条列表**：\`.progress-list > .progress-item > .progress-header + .progress-bar > .progress-fill[data-percent]\`
9. **提示框**：\`.callout.callout-{info|success|warning|danger} > .callout-title + .callout-content\`
10. **引用块**：\`.quote-block > .quote-text + .quote-source\`（装饰引号）
11. **摘要/要点框**：\`.summary-box > .summary-title + ul > li\`（金色/强调色边框）
12. **封面区域**：\`.report-cover > .cover-label + .cover-title + .cover-subtitle + .cover-meta\`

---

## CSS 陷阱警告（必须遵守）

1. **\`-clamp()\` / \`-min()\` / \`-max()\` 是无效 CSS！** 取反必须用 \`calc(-1 * clamp(...))\`
2. **\`overflow: hidden\` + \`border-radius\`** 在 Safari 需要 \`-webkit-mask-image: -webkit-radial-gradient(white, black);\`
3. **\`position: sticky\`** 需要最近滚动祖先的 \`overflow\` 不是 \`hidden\`

---

## 设计反模式（禁止出现）

- 不要使用 Inter、Roboto、Arial 作为展示字体（太通用）
- 不要使用紫色渐变 + 白底的"AI 风格"审美
- 不要在页面上显示操作提示（如"滚动查看更多"）
- 不要使用 \`<br>\` 标签手动换行，用 \`<p>\` 分段
- 不要把所有代码压缩到一行
- 不要使用 \`position: absolute\` 堆叠 section（这不是 PPT！）
- 不要设置 \`overflow: hidden\` 在 body 上
- 不要使用键盘翻页导航（报告是滚动的）

---

## 内容结构要求

生成的报告至少包含 6-8 个 section，结构丰富多样：

1. **封面区域**（标题 + 副标题 + 元信息）
2. **执行摘要**（关键发现 + 概述）
3. **核心指标**（KPI 数字 + 图表 + 进度条）
4. **详细分析**（卡片 + 图表 + 表格，多维度展开）
5. **趋势/时间轴**（里程碑 / 发展历程）
6. **对比/竞争**（对比栏 + 雷达图 + 数据表格）
7. **建议/策略**（行动卡片 + 引用 + 代码/OKR）
8. **总结/展望**（要点回顾 + 展望）

每个 section 应包含 2-4 种不同的内容组件。

---

${template.styleGuide}

## 参考模板

以下是一个完整的「${template.name}」风格 HTML 报告示例，请**严格参考**其结构、样式和交互实现：

\`\`\`html
${template.fullTemplate}
\`\`\`

## 输出要求（极其重要，必须严格遵守）

1. **直接输出完整的 HTML 代码**，以 \`<!DOCTYPE html>\` 开始，以 \`</html>\` 结束
2. **绝对不要**使用 \`\`\`html 或 \`\`\` 代码块包裹输出内容
3. **绝对不要**在 HTML 代码前添加任何说明文字（如"好的，这是生成的报告："）
4. **绝对不要**在 HTML 代码后添加任何解释文字
5. 输出的内容应该是一个可以直接保存为 .html 文件并在浏览器中打开的完整文档
6. HTML、CSS、JS 必须全部包含在一个文件中
7. **代码格式要求**：
   - 必须保持正确的换行和缩进格式
   - 每个 HTML 标签应该在单独的行上
   - CSS 规则应该正确换行，每个属性一行
   - JS 代码应该有正确的缩进和换行
   - **绝对不要**把所有代码压缩到一行或几行
`;

export const getReportGenerationUserPrompt = (
  resourceNames: string[],
  templateName: string,
  userPrompt?: string,
): string => {
  return buildVibeLearningGenerationUserPrompt({
    title: `「${templateName}」风格 HTML 报告生成`,
    resourceNames,
    userPrompt,
    extraReminders: [
      `生成的报告必须严格遵循「${templateName}」的视觉风格和设计规范`,
      "报告是可滚动的长文档，不是逐页 PPT，必须使用正常文档流",
      "必须使用 ECharts CDN 实现图表，不要使用 CSS-only 图表",
      "必须包含 @media print 打印样式",
      "至少生成 6-8 个 section，内容组件多样化",
    ],
    finalOutput: [
      "获取足够信息后，直接输出完整的 HTML 代码",
      "以 <!DOCTYPE html> 开始，以 </html> 结束",
      "不要使用代码块标记（```）",
      "不要在 HTML 前后添加任何说明文字",
      "确保 HTML 文件包含完整的 CSS 样式和 JS 交互代码",
      "必须保持正确的代码格式：每个标签、CSS 规则、JS 语句都要正确换行和缩进，不要压缩成一行",
    ],
  });
};

export const cleanReportHtmlContent = (content: string): string => {
  let html = content.trim();

  html = html.replace(/^```\s*html?\s*\n?/i, "");
  html = html.replace(/^```\s*\n?/i, "");
  html = html.replace(/\n?\s*```\s*$/i, "");
  html = html.replace(/^`{3,}\s*html?\s*/gim, "");
  html = html.replace(/\s*`{3,}\s*$/gim, "");

  const doctypeIndex = html.toLowerCase().indexOf("<!doctype");
  const htmlTagIndex = html.toLowerCase().indexOf("<html");
  const startIndex =
    doctypeIndex !== -1
      ? doctypeIndex
      : htmlTagIndex !== -1
        ? htmlTagIndex
        : -1;

  if (startIndex > 0) {
    html = html.substring(startIndex);
  }

  const endIndex = html.toLowerCase().lastIndexOf("</html>");
  if (endIndex !== -1) {
    html = html.substring(0, endIndex + 7);
  }

  return html;
};
