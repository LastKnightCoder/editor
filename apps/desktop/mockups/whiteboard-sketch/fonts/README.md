# 字体对比页的字体子集

`fonts.html` 用到的字体子集，由 `build.py` 从下列原始字体裁出（只含页面用到的字），均为 SIL Open Font License 1.1：

| 文件                | 字体          | 来源                                                      |
| ------------------- | ------------- | --------------------------------------------------------- |
| `sk-xiaolai.woff2`  | 小赖 SC       | https://github.com/lxgw/kose-font                         |
| `sk-shantell.woff2` | Shantell Sans | https://github.com/arrowtype/shantell-sans                |
| `sk-patrick.woff2`  | Patrick Hand  | https://github.com/google/fonts/tree/main/ofl/patrickhand |
| `sk-itim.woff2`     | Itim          | https://github.com/google/fonts/tree/main/ofl/itim        |

霞鹜文楷、悠哉、Delius、Short Stack 声明了保留字体名，子集化后不能沿用原名分发，本页不内嵌，对比卡片使用本机已安装的字体。

应用实际内置的手绘字体见 `apps/desktop/src/assets/fonts/hand/`（Shantell Sans + 小赖 SC，许可原文随附）。
