"""
白板手绘模式内置字体构建（D-106）：Shantell Sans（拉丁）+ 小赖 SC（中文）。

- Shantell Sans：只留 Basic Latin / Latin-1 / 常用标点符号，可变轴保留 wght 与 INFM。
- 小赖 SC：按《通用规范汉字表》8105 字 + 中文标点 + 全角字符子集化，再按 unicode-range
  切片（每片约 SLICE_SIZE 个字），浏览器只加载页面用到的片；snapdom 导出时也只内嵌命中的片。

产物写到 src/assets/fonts/hand/（woff2 + hand-font.css + OFL 许可），提交进仓库，
构建期不重新切片。字体或字表升级时重跑：

  pip install --user fonttools brotli
  python3 apps/desktop/scripts/build-hand-font.py \
      --shantell ShantellSans[BNCE,INFM,SPAC,wght].ttf \
      --xiaolai Xiaolai-Regular.ttf \
      --charset level-1.txt level-2.txt level-3.txt

字体来源：
  Shantell Sans  https://github.com/arrowtype/shantell-sans （google/fonts ofl/shantellsans）
  小赖 SC        https://github.com/lxgw/kose-font （release Xiaolai-Regular.ttf）
  通用规范汉字表  https://github.com/shengdoushi/common-standard-chinese-characters-table
"""

import argparse
import io
import json
import shutil
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

OUT = Path(__file__).resolve().parent.parent / "src" / "assets" / "fonts" / "hand"
SLICE_SIZE = 220

# Shantell Sans 负责的拉丁与符号区段；其余字符回落到小赖
LATIN_RANGES = [
    (0x0020, 0x007E),  # Basic Latin
    (0x00A0, 0x00FF),  # Latin-1 Supplement
    (0x2010, 0x2027),  # 连字符、引号、省略号
    (0x2030, 0x203A),
    (0x20AC, 0x20AC),  # €
    (0x2190, 0x2193),  # ←↑→↓
    (0x2212, 0x2212),  # −
]

# 小赖额外保留：中文标点、全角字符、常用符号（Shantell 没有的）
CJK_EXTRA_RANGES = [
    (0x3000, 0x303F),  # CJK 符号和标点
    (0xFF00, 0xFFEF),  # 全角 ASCII、全角标点
    (0x2000, 0x206F),  # 通用标点（Shantell 缺的由小赖补）
    (0x2100, 0x214F),  # 字母式符号（℃ № 等）
    (0x2150, 0x218F),  # 数字形式
    (0x2190, 0x21FF),  # 箭头
    (0x2200, 0x22FF),  # 数学运算符（√ Σ × ≈ …）
    (0x2460, 0x24FF),  # 带圈数字
    (0x2500, 0x257F),  # 制表符
    (0x25A0, 0x25FF),  # 几何图形
    (0x2600, 0x26FF),  # 杂项符号
    (0x00B7, 0x00B7),  # ·
    (0x00D7, 0x00D7),  # ×
    (0x00F7, 0x00F7),  # ÷
    (0x02C6, 0x02DD),  # 修饰符号
    (0x0391, 0x03C9),  # 希腊字母
]


def expand(ranges):
    return {cp for start, end in ranges for cp in range(start, end + 1)}


def unicode_range(codepoints):
    """连续码位合并成 CSS unicode-range"""
    cps = sorted(codepoints)
    parts, start, prev = [], cps[0], cps[0]
    for cp in cps[1:] + [None]:
        if cp is not None and cp == prev + 1:
            prev = cp
            continue
        parts.append(f"U+{start:X}" if start == prev else f"U+{start:X}-{prev:X}")
        if cp is not None:
            start = prev = cp
    return ", ".join(parts)


def subset_to(src_font, codepoints, out_path):
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.hinting = False
    font = TTFont(src_font) if isinstance(src_font, (str, Path)) else src_font
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    subset.save_font(font, str(out_path), options)
    return out_path.stat().st_size


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--shantell", required=True)
    parser.add_argument("--xiaolai", required=True)
    parser.add_argument("--charset", nargs="+", required=True, help="通用规范汉字表各级字表")
    parser.add_argument("--shantell-license")
    parser.add_argument("--xiaolai-license")
    args = parser.parse_args()

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    css = [
        "/* 由 scripts/build-hand-font.py 生成，勿手改。白板手绘模式字体（D-106），OFL-1.1，许可见同目录 */"
    ]
    # 导出内嵌用：分片 → 起始码位（分片互不重叠，起始码位即可唯一对上 document.fonts 里的 FontFace）
    manifest = []

    # Shantell Sans：固定 BNCE / SPAC 两轴为默认值，保留 wght 与 INFM
    shantell = instancer.instantiateVariableFont(TTFont(args.shantell), {"BNCE": 0, "SPAC": 0})
    # instancer 之后字形缓存与表不同步，落盘再读回一次再子集化
    buffer = io.BytesIO()
    shantell.save(buffer)
    buffer.seek(0)
    shantell = TTFont(buffer)
    shantell_cmap = shantell.getBestCmap()
    latin = {cp for cp in expand(LATIN_RANGES) if cp in shantell_cmap}
    size = subset_to(shantell, latin, OUT / "shantell-sans.woff2")
    css.append(
        '@font-face { font-family: "Tau Hand Latin"; src: url("./shantell-sans.woff2") format("woff2"); '
        f"font-weight: 300 800; font-display: swap; unicode-range: {unicode_range(latin)}; }}"
    )
    manifest.append({"family": "Tau Hand Latin", "file": "shantell-sans.woff2", "start": min(latin)})
    print(f"shantell-sans.woff2  {len(latin):5} 字  {size / 1024:7.1f} KB")

    # 小赖 SC：通用规范汉字 + 中文标点符号，按码位顺序切片
    hanzi = set()
    for path in args.charset:
        hanzi |= {ord(c) for c in Path(path).read_text(encoding="utf-8") if not c.isspace()}
    xiaolai_cmap = TTFont(args.xiaolai).getBestCmap()
    wanted = (hanzi | expand(CJK_EXTRA_RANGES)) - latin
    covered = sorted(cp for cp in wanted if cp in xiaolai_cmap)
    missing = sorted(cp for cp in hanzi if cp not in xiaolai_cmap)
    if missing:
        print(f"小赖缺字 {len(missing)}：{''.join(map(chr, missing[:40]))}")

    total = 0
    families = ["Tau Hand Latin"]
    for index in range(0, len(covered), SLICE_SIZE):
        chunk = covered[index : index + SLICE_SIZE]
        name = f"xiaolai-{index // SLICE_SIZE:03}.woff2"
        # 每片独立 family：snapdom 内嵌时按 family + 字重去重，同名分片只会留一个
        family = f"Tau Hand CJK {index // SLICE_SIZE:03}"
        size = subset_to(args.xiaolai, set(chunk), OUT / name)
        total += size
        families.append(family)
        manifest.append({"family": family, "file": name, "start": chunk[0]})
        css.append(
            f'@font-face {{ font-family: "{family}"; src: url("./{name}") format("woff2"); '
            f"font-weight: 400; font-display: swap; unicode-range: {unicode_range(chunk)}; }}"
        )
    slices = (len(covered) + SLICE_SIZE - 1) // SLICE_SIZE
    print(f"xiaolai-*.woff2      {len(covered):5} 字  {total / 1024:7.1f} KB（{slices} 片）")

    # 字体栈：各片 unicode-range 互不重叠，顺序不影响回退
    stack = ", ".join(f'"{family}"' for family in families)
    css.append(f":root {{ --tau-font-hand-faces: {stack}; }}")
    (OUT / "hand-font.css").write_text("\n".join(css) + "\n", encoding="utf-8")
    (OUT / "hand-font.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    for license_path, name in ((args.shantell_license, "OFL-ShantellSans.txt"), (args.xiaolai_license, "OFL-Xiaolai.txt")):
        if license_path:
            shutil.copy(license_path, OUT / name)


if __name__ == "__main__":
    main()
