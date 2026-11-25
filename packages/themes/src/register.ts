/**
 * 内置主题的副作用注册。各入口 import 本文件，保证取注册表前主题已就位。
 * 彩色主题按强调色在色环上的位置排（暖纸起：橙 → 黄绿 → 绿 → 青 → 蓝 → 紫 → 粉），
 * 设置页三列网格里相邻色相挨在一起；素色主题靠 order 排在最后。
 */
import "./themes/paper.theme.ts";
import "./themes/matcha.theme.ts";
import "./themes/mint.theme.ts";
import "./themes/celadon.theme.ts";
import "./themes/ocean.theme.ts";
import "./themes/wisteria.theme.ts";
import "./themes/sakura.theme.ts";
import "./themes/ink.theme.ts";
import "./themes/mono.theme.ts";
