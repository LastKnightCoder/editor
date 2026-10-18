import "@tau/themes/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/hero.css";
import "./styles/feel.css";
import "./styles/loop.css";
import "./styles/ai.css";
import "./styles/daily.css";
import "./styles/sections.css";
import "./styles/responsive.css";

import { renderAppShells } from "./modules/appShell.ts";
import { initDaily } from "./modules/daily.ts";
import { initHeroSplit } from "./modules/heroSplit.ts";
import { renderIllustrations } from "./modules/illustrations.ts";
import { initLayout } from "./modules/layout.ts";
import { initLoop } from "./modules/loop.ts";
import { initMarkdownDemo } from "./modules/markdownDemo.ts";
import { initTheme } from "./modules/theme.ts";

// 先把示意窗口画完整，再复制深色副本，最后统一套主题
renderAppShells();
renderIllustrations();
initHeroSplit();
initTheme();
initMarkdownDemo();
initLoop();
initDaily();
initLayout();
