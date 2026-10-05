"""
字体对比页的子集构建：只裁出 fonts.html 用到的字，转 woff2。
用法：python3 build.py <源字体目录>（默认 /tmp/sk-fonts）
源字体均为 OFL，来源见 README.md。
"""
import json
import re
import sys
from pathlib import Path

from fontTools import subset

HERE = Path(__file__).resolve().parent
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/sk-fonts")

# family 名 → 源文件
FONTS = {
    "SK Xiaolai": "XiaolaiSC-Regular.ttf",
    "SK Shantell": "ShantellSans[BNCE,INFM,SPAC,wght].ttf",
    "SK Patrick": "PatrickHand-Regular.ttf",
    "SK Itim": "Itim-Regular.ttf",
    # 霞鹜文楷、悠哉、Delius、Short Stack 声明了保留字体名，子集化属于修改，不能沿用原名分发，对比页不内嵌
}

html = (HERE.parent / "fonts.html").read_text(encoding="utf-8")
samples = json.loads(re.search(r'<script id="samples" type="application/json">(.*?)</script>', html, re.S).group(1))
text = "".join(samples["scene"]) + samples["note"] + samples["para"] + samples["read"]
chars = "".join(sorted(set(text))) + " "

css = []
for family, filename in FONTS.items():
    out = HERE / (re.sub(r"\W+", "-", family.lower()).strip("-") + ".woff2")
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    font = subset.load_font(str(SRC / filename), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=chars)
    subsetter.subset(font)
    subset.save_font(font, str(out), options)
    weight = "300 800" if "wght" in filename else "400"
    css.append(
        f'@font-face {{ font-family: "{family}"; src: url("{out.name}") format("woff2"); '
        f"font-weight: {weight}; font-display: block; }}"
    )
    print(f"{family:16} {out.name:22} {out.stat().st_size / 1024:6.1f} KB")

(HERE / "fonts.css").write_text(
    "/* 由 build.py 生成：仅含 fonts.html 用到的字 */\n" + "\n".join(css) + "\n", encoding="utf-8"
)
