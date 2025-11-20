export interface MindMapTheme {
  id: string;
  label: string;
  type: "light" | "dark";
  palette: Array<{
    background: string;
    color: string; // text color
    type: "light" | "dark"; // theme type for this specific color
  }>; // Colors for levels 2+, cycles after palette.length
  root: {
    background: string;
    color: string;
    borderRadius: number;
    borderColor?: string;
    borderWidth?: number;
  };
  node: {
    borderRadius: number;
    borderWidth: number;
    borderColor: string;
  };
}

export const MIND_MAP_THEMES: MindMapTheme[] = [
  {
    id: "rainbow",
    label: "彩虹",
    type: "light",
    palette: [
      { background: "#FF6B6B", color: "#ffffff", type: "dark" }, // 红
      { background: "#4ECDC4", color: "#ffffff", type: "dark" }, // 青
      { background: "#FFE66D", color: "#1a1a1a", type: "light" }, // 黄
      { background: "#95E1D3", color: "#1a1a1a", type: "light" }, // 薄荷绿
      { background: "#A8E6CF", color: "#1a1a1a", type: "light" }, // 浅绿
      { background: "#C7CEEA", color: "#1a1a1a", type: "light" }, // 淡紫
    ],
    root: {
      background: "#1a1a1a",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "vitality",
    label: "活力",
    type: "light",
    palette: [
      { background: "#F5F5F5", color: "#1a1a1a", type: "light" }, // 浅灰
      { background: "#FF3B3B", color: "#ffffff", type: "dark" }, // 红
      { background: "#FFD93D", color: "#1a1a1a", type: "light" }, // 黄
      { background: "#4D96FF", color: "#ffffff", type: "dark" }, // 蓝
      { background: "#1a1a1a", color: "#ffffff", type: "dark" }, // 深灰
    ],
    root: {
      background: "#FF6B6B",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 2,
      borderColor: "#333333",
    },
  },
  {
    id: "dance",
    label: "舞动",
    type: "light",
    palette: [
      { background: "#4D7CFE", color: "#ffffff", type: "dark" }, // 蓝
      { background: "#FF6B9D", color: "#ffffff", type: "dark" }, // 粉红
      { background: "#F5F5F5", color: "#1a1a1a", type: "light" }, // 浅灰
      { background: "#FFF4E6", color: "#1a1a1a", type: "light" }, // 米色
      { background: "#C1292E", color: "#ffffff", type: "dark" }, // 深红
      { background: "#2C2C2C", color: "#ffffff", type: "dark" }, // 深灰
    ],
    root: {
      background: "#4D7CFE",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "code",
    label: "代码",
    type: "light",
    palette: [
      { background: "#FFF9E6", color: "#1a1a1a", type: "light" }, // 浅黄
      { background: "#D4F4DD", color: "#1a1a1a", type: "light" }, // 浅绿
      { background: "#F5F5F5", color: "#1a1a1a", type: "light" }, // 浅灰
      { background: "#E6D5FF", color: "#1a1a1a", type: "light" }, // 浅紫
      { background: "#C2E7FF", color: "#1a1a1a", type: "light" }, // 浅蓝
      { background: "#2C3E50", color: "#ffffff", type: "dark" }, // 深蓝灰
    ],
    root: {
      background: "#34495E",
      color: "#ffffff",
      borderRadius: 6,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "#E0E0E0",
    },
  },
  {
    id: "breeze",
    label: "和风",
    type: "light",
    palette: [
      { background: "#F5F5F5", color: "#1a1a1a", type: "light" }, // 浅灰
      { background: "#FFB5B5", color: "#1a1a1a", type: "light" }, // 浅粉
      { background: "#FF8A5B", color: "#ffffff", type: "dark" }, // 橙
      { background: "#A8D8EA", color: "#1a1a1a", type: "light" }, // 浅蓝
      { background: "#6C5CE7", color: "#ffffff", type: "dark" }, // 紫
      { background: "#2D3561", color: "#ffffff", type: "dark" }, // 深蓝
    ],
    root: {
      background: "#FFEAA7",
      color: "#2D3561",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "island",
    label: "岛屿",
    type: "light",
    palette: [
      { background: "#F5E6D3", color: "#1a1a1a", type: "light" }, // 米色
      { background: "#E8C4A0", color: "#1a1a1a", type: "light" }, // 浅棕
      { background: "#D4A574", color: "#1a1a1a", type: "light" }, // 中棕
      { background: "#C8B8A8", color: "#1a1a1a", type: "light" }, // 灰棕
      { background: "#A8A89D", color: "#1a1a1a", type: "light" }, // 灰绿
      { background: "#6B7C5E", color: "#ffffff", type: "dark" }, // 深绿
    ],
    root: {
      background: "#8B7355",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "rose",
    label: "玫瑰",
    type: "light",
    palette: [
      { background: "#FFF0F5", color: "#1a1a1a", type: "light" }, // 浅粉
      { background: "#FFE4EC", color: "#1a1a1a", type: "light" }, // 粉白
      { background: "#FFB3D9", color: "#1a1a1a", type: "light" }, // 粉
      { background: "#FF8DC7", color: "#ffffff", type: "dark" }, // 中粉
      { background: "#FF6BB5", color: "#ffffff", type: "dark" }, // 深粉
      { background: "#C41E3A", color: "#ffffff", type: "dark" }, // 玫瑰红
    ],
    root: {
      background: "#E91E63",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "lotus",
    label: "薄荷",
    type: "light",
    palette: [
      { background: "#F5FEFF", color: "#1a1a1a", type: "light" }, // 极浅青白
      { background: "#E0F7FA", color: "#1a1a1a", type: "light" }, // 极浅青
      { background: "#B2EBF2", color: "#1a1a1a", type: "light" }, // 浅青
      { background: "#80DEEA", color: "#1a1a1a", type: "light" }, // 中青
      { background: "#4DD0E1", color: "#1a1a1a", type: "light" }, // 青
      { background: "#00ACC1", color: "#ffffff", type: "dark" }, // 深青
    ],
    root: {
      background: "#26C6DA",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "green-tea",
    label: "绿茶",
    type: "light",
    palette: [
      { background: "#F5F5DC", color: "#1a1a1a", type: "light" }, // 米黄
      { background: "#D4D4AA", color: "#1a1a1a", type: "light" }, // 浅绿灰
      { background: "#8FBC8F", color: "#1a1a1a", type: "light" }, // 海绿
      { background: "#6B8E23", color: "#ffffff", type: "dark" }, // 橄榄绿
      { background: "#556B2F", color: "#ffffff", type: "dark" }, // 深橄榄绿
      { background: "#2F4F2F", color: "#ffffff", type: "dark" }, // 深绿
    ],
    root: {
      background: "#7CB342",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "space",
    label: "宇宙",
    type: "dark",
    palette: [
      { background: "#E8EAF6", color: "#1a1a1a", type: "light" }, // 浅紫灰
      { background: "#B3E5FC", color: "#1a1a1a", type: "light" }, // 浅蓝
      { background: "#81D4FA", color: "#1a1a1a", type: "light" }, // 天蓝
      { background: "#4FC3F7", color: "#1a1a1a", type: "light" }, // 蓝
      { background: "#29B6F6", color: "#ffffff", type: "dark" }, // 深蓝
      { background: "#0277BD", color: "#ffffff", type: "dark" }, // 深海蓝
    ],
    root: {
      background: "#1A237E",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  // 图片中的新主题
  {
    id: "elegant",
    label: "精致",
    type: "light",
    palette: [
      { background: "#8B6F47", color: "#ffffff", type: "dark" }, // 棕色
      { background: "#F5E6D3", color: "#1a1a1a", type: "light" }, // 米色
      { background: "#D4A574", color: "#1a1a1a", type: "light" }, // 浅棕
      { background: "#C44536", color: "#ffffff", type: "dark" }, // 红棕
      { background: "#2C2C2C", color: "#ffffff", type: "dark" }, // 深灰
    ],
    root: {
      background: "#8B6F47",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "pure",
    label: "纯真",
    type: "light",
    palette: [
      { background: "#FFE4F0", color: "#1a1a1a", type: "light" }, // 浅粉
      { background: "#FF69B4", color: "#ffffff", type: "dark" }, // 粉红
      { background: "#B0E0E6", color: "#1a1a1a", type: "light" }, // 浅蓝
      { background: "#6495ED", color: "#ffffff", type: "dark" }, // 蓝
      { background: "#4A4A4A", color: "#ffffff", type: "dark" }, // 深灰
    ],
    root: {
      background: "#FF69B4",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "macaron",
    label: "马卡龙",
    type: "light",
    palette: [
      { background: "#D4B5A0", color: "#1a1a1a", type: "light" }, // 米棕
      { background: "#FFCBA4", color: "#1a1a1a", type: "light" }, // 浅橙
      { background: "#C5E1A5", color: "#1a1a1a", type: "light" }, // 浅绿
      { background: "#F5F5DC", color: "#1a1a1a", type: "light" }, // 米色
      { background: "#F0E68C", color: "#1a1a1a", type: "light" }, // 浅黄
      { background: "#4A4A4A", color: "#ffffff", type: "dark" }, // 深灰
    ],
    root: {
      background: "#D4B5A0",
      color: "#1a1a1a",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "woodland",
    label: "林地",
    type: "light",
    palette: [
      { background: "#D4AF37", color: "#1a1a1a", type: "light" }, // 金色
      { background: "#556B2F", color: "#ffffff", type: "dark" }, // 橄榄绿
      { background: "#6B8E23", color: "#ffffff", type: "dark" }, // 黄绿
      { background: "#9ACD32", color: "#1a1a1a", type: "light" }, // 黄绿
      { background: "#C9E4A0", color: "#1a1a1a", type: "light" }, // 浅绿
      { background: "#2F4F2F", color: "#ffffff", type: "dark" }, // 深绿
    ],
    root: {
      background: "#556B2F",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "cream",
    label: "奶油",
    type: "light",
    palette: [
      { background: "#E8F5E9", color: "#1a1a1a", type: "light" }, // 浅绿
      { background: "#E1BEE7", color: "#1a1a1a", type: "light" }, // 浅紫
      { background: "#F5F5F5", color: "#1a1a1a", type: "light" }, // 浅灰
      { background: "#B3E5FC", color: "#1a1a1a", type: "light" }, // 浅蓝
      { background: "#FFCCBC", color: "#1a1a1a", type: "light" }, // 浅橙
      { background: "#9575CD", color: "#ffffff", type: "dark" }, // 紫色
    ],
    root: {
      background: "#E8F5E9",
      color: "#2F4F2F",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "hawaii",
    label: "夏威夷",
    type: "light",
    palette: [
      { background: "#81D4FA", color: "#1a1a1a", type: "light" }, // 浅蓝
      { background: "#4FC3F7", color: "#1a1a1a", type: "light" }, // 蓝
      { background: "#0288D1", color: "#ffffff", type: "dark" }, // 深蓝
      { background: "#006064", color: "#ffffff", type: "dark" }, // 深青
      { background: "#FFB74D", color: "#1a1a1a", type: "light" }, // 橙
      { background: "#FFF9C4", color: "#1a1a1a", type: "light" }, // 浅黄
    ],
    root: {
      background: "#0288D1",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "pinecone",
    label: "松果",
    type: "light",
    palette: [
      { background: "#5D4E37", color: "#ffffff", type: "dark" }, // 深棕
      { background: "#8B7355", color: "#ffffff", type: "dark" }, // 中棕
      { background: "#0F4C5C", color: "#ffffff", type: "dark" }, // 深青
      { background: "#C8C8C8", color: "#1a1a1a", type: "light" }, // 浅灰
      { background: "#E0E0E0", color: "#1a1a1a", type: "light" }, // 灰
    ],
    root: {
      background: "#5D4E37",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "dystopia",
    label: "反乌托邦",
    type: "light",
    palette: [
      { background: "#C41E3A", color: "#ffffff", type: "dark" }, // 深红
      { background: "#F0F0F0", color: "#1a1a1a", type: "light" }, // 浅灰
      { background: "#D3D3D3", color: "#1a1a1a", type: "light" }, // 灰
      { background: "#9E9E9E", color: "#ffffff", type: "dark" }, // 中灰
      { background: "#616161", color: "#ffffff", type: "dark" }, // 深灰
      { background: "#2C2C2C", color: "#ffffff", type: "dark" }, // 暗灰
    ],
    root: {
      background: "#C41E3A",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "watercolor",
    label: "水粉",
    type: "light",
    palette: [
      { background: "#F5F5F5", color: "#1a1a1a", type: "light" }, // 浅灰
      { background: "#FFB6C1", color: "#1a1a1a", type: "light" }, // 浅粉
      { background: "#FFF59D", color: "#1a1a1a", type: "light" }, // 浅黄
      { background: "#C5CAE9", color: "#1a1a1a", type: "light" }, // 浅紫
      { background: "#B39DDB", color: "#1a1a1a", type: "light" }, // 紫
      { background: "#5C6BC0", color: "#ffffff", type: "dark" }, // 蓝紫
    ],
    root: {
      background: "#B39DDB",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "gorgeous",
    label: "华丽",
    type: "light",
    palette: [
      { background: "#F5F5F5", color: "#1a1a1a", type: "light" }, // 浅灰
      { background: "#CCFF90", color: "#1a1a1a", type: "light" }, // 浅绿
      { background: "#FFB300", color: "#1a1a1a", type: "light" }, // 橙
      { background: "#FF6F00", color: "#ffffff", type: "dark" }, // 深橙
      { background: "#FF5252", color: "#ffffff", type: "dark" }, // 红
      { background: "#00BCD4", color: "#ffffff", type: "dark" }, // 青
      { background: "#1A1A1A", color: "#ffffff", type: "dark" }, // 深灰
    ],
    root: {
      background: "#FF6F00",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "refined",
    label: "雅致",
    type: "light",
    palette: [
      { background: "#FFF9E6", color: "#1a1a1a", type: "light" }, // 浅黄
      { background: "#F0F0F0", color: "#1a1a1a", type: "light" }, // 浅灰
      { background: "#4DB6AC", color: "#ffffff", type: "dark" }, // 青绿
      { background: "#90A4AE", color: "#ffffff", type: "dark" }, // 灰蓝
      { background: "#D1C4E9", color: "#1a1a1a", type: "light" }, // 浅紫
      { background: "#2C3E50", color: "#ffffff", type: "dark" }, // 深蓝灰
    ],
    root: {
      background: "#4DB6AC",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "colorful",
    label: "多彩",
    type: "light",
    palette: [
      { background: "#F0F0F0", color: "#1a1a1a", type: "light" }, // 浅灰
      { background: "#80DEEA", color: "#1a1a1a", type: "light" }, // 浅青
      { background: "#FDD835", color: "#1a1a1a", type: "light" }, // 黄
      { background: "#FF7043", color: "#ffffff", type: "dark" }, // 橙红
      { background: "#7986CB", color: "#ffffff", type: "dark" }, // 蓝
      { background: "#1A237E", color: "#ffffff", type: "dark" }, // 深蓝
    ],
    root: {
      background: "#7986CB",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "dazzling",
    label: "炫彩",
    type: "light",
    palette: [
      { background: "#F8F8F8", color: "#1a1a1a", type: "light" }, // 浅灰
      { background: "#F8BBD0", color: "#1a1a1a", type: "light" }, // 浅粉
      { background: "#FF4081", color: "#ffffff", type: "dark" }, // 粉红
      { background: "#E040FB", color: "#ffffff", type: "dark" }, // 紫红
      { background: "#7C4DFF", color: "#ffffff", type: "dark" }, // 紫
      { background: "#263238", color: "#ffffff", type: "dark" }, // 深灰
    ],
    root: {
      background: "#E040FB",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "retro",
    label: "复古",
    type: "light",
    palette: [
      { background: "#F0C987", color: "#1a1a1a", type: "light" }, // 金黄
      { background: "#FF8A65", color: "#1a1a1a", type: "light" }, // 橙
      { background: "#D78A76", color: "#1a1a1a", type: "light" }, // 橙粉
      { background: "#A1887F", color: "#ffffff", type: "dark" }, // 棕灰
      { background: "#4DB6AC", color: "#ffffff", type: "dark" }, // 青绿
      { background: "#37474F", color: "#ffffff", type: "dark" }, // 深蓝灰
    ],
    root: {
      background: "#A1887F",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "dessert",
    label: "甜点",
    type: "light",
    palette: [
      { background: "#FFF3E0", color: "#1a1a1a", type: "light" }, // 浅橙
      { background: "#FFAB91", color: "#1a1a1a", type: "light" }, // 橙
      { background: "#FFD54F", color: "#1a1a1a", type: "light" }, // 黄
      { background: "#FF9800", color: "#1a1a1a", type: "light" }, // 深橙
      { background: "#81D4FA", color: "#1a1a1a", type: "light" }, // 浅蓝
      { background: "#4FC3F7", color: "#1a1a1a", type: "light" }, // 蓝
    ],
    root: {
      background: "#FF9800",
      color: "#1a1a1a",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "vanilla",
    label: "香草",
    type: "light",
    palette: [
      { background: "#F0F8FF", color: "#1a1a1a", type: "light" }, // 浅蓝白
      { background: "#B2DFDB", color: "#1a1a1a", type: "light" }, // 浅青
      { background: "#4DB6AC", color: "#ffffff", type: "dark" }, // 青绿
      { background: "#26A69A", color: "#ffffff", type: "dark" }, // 深青绿
      { background: "#00897B", color: "#ffffff", type: "dark" }, // 深绿
      { background: "#004D40", color: "#ffffff", type: "dark" }, // 深墨绿
    ],
    root: {
      background: "#26A69A",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "candy",
    label: "糖果",
    type: "light",
    palette: [
      { background: "#FFF8E1", color: "#1a1a1a", type: "light" }, // 浅黄
      { background: "#FFB74D", color: "#1a1a1a", type: "light" }, // 橙
      { background: "#FDD835", color: "#1a1a1a", type: "light" }, // 黄
      { background: "#FF9800", color: "#1a1a1a", type: "light" }, // 深橙
      { background: "#90CAF9", color: "#1a1a1a", type: "light" }, // 浅蓝
      { background: "#42A5F5", color: "#ffffff", type: "dark" }, // 蓝
    ],
    root: {
      background: "#FF9800",
      color: "#1a1a1a",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "neon",
    label: "霓虹",
    type: "light",
    palette: [
      { background: "#E0F7FA", color: "#1a1a1a", type: "light" }, // 浅青
      { background: "#80DEEA", color: "#1a1a1a", type: "light" }, // 青
      { background: "#4DD0E1", color: "#1a1a1a", type: "light" }, // 青蓝
      { background: "#42A5F5", color: "#ffffff", type: "dark" }, // 蓝
      { background: "#7E57C2", color: "#ffffff", type: "dark" }, // 紫
      { background: "#AB47BC", color: "#ffffff", type: "dark" }, // 紫红
    ],
    root: {
      background: "#42A5F5",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "cherry-blossom",
    label: "樱花",
    type: "light",
    palette: [
      { background: "#FFF0F5", color: "#1a1a1a", type: "light" }, // 浅粉白
      { background: "#FFE4E1", color: "#1a1a1a", type: "light" }, // 浅粉
      { background: "#FFB6C1", color: "#1a1a1a", type: "light" }, // 粉
      { background: "#FF69B4", color: "#ffffff", type: "dark" }, // 粉红
      { background: "#E6E6FA", color: "#1a1a1a", type: "light" }, // 浅紫
      { background: "#D8BFD8", color: "#1a1a1a", type: "light" }, // 紫
    ],
    root: {
      background: "#FF69B4",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "fireplace",
    label: "壁炉",
    type: "light",
    palette: [
      { background: "#FFE0B2", color: "#1a1a1a", type: "light" }, // 浅橙
      { background: "#FFB74D", color: "#1a1a1a", type: "light" }, // 橙
      { background: "#FF9800", color: "#1a1a1a", type: "light" }, // 深橙
      { background: "#FF6F00", color: "#ffffff", type: "dark" }, // 深橙红
      { background: "#E65100", color: "#ffffff", type: "dark" }, // 红棕
      { background: "#4E342E", color: "#ffffff", type: "dark" }, // 深棕
    ],
    root: {
      background: "#FF6F00",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "holiday",
    label: "假日",
    type: "light",
    palette: [
      { background: "#E8F5E9", color: "#1a1a1a", type: "light" }, // 浅绿
      { background: "#FFA726", color: "#1a1a1a", type: "light" }, // 橙
      { background: "#EF5350", color: "#ffffff", type: "dark" }, // 红
      { background: "#C62828", color: "#ffffff", type: "dark" }, // 深红
      { background: "#00796B", color: "#ffffff", type: "dark" }, // 深绿
      { background: "#263238", color: "#ffffff", type: "dark" }, // 深灰
    ],
    root: {
      background: "#C62828",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "ocean",
    label: "海洋",
    type: "light",
    palette: [
      { background: "#E1F5FE", color: "#1a1a1a", type: "light" }, // 浅蓝
      { background: "#81D4FA", color: "#1a1a1a", type: "light" }, // 天蓝
      { background: "#29B6F6", color: "#1a1a1a", type: "light" }, // 蓝
      { background: "#039BE5", color: "#ffffff", type: "dark" }, // 深蓝
      { background: "#0277BD", color: "#ffffff", type: "dark" }, // 深海蓝
      { background: "#01579B", color: "#ffffff", type: "dark" }, // 极深蓝
    ],
    root: {
      background: "#039BE5",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
  {
    id: "wisteria",
    label: "紫藤",
    type: "light",
    palette: [
      { background: "#FFF9E6", color: "#1a1a1a", type: "light" }, // 浅黄
      { background: "#FFD54F", color: "#1a1a1a", type: "light" }, // 黄
      { background: "#E1BEE7", color: "#1a1a1a", type: "light" }, // 浅紫
      { background: "#CE93D8", color: "#1a1a1a", type: "light" }, // 紫
      { background: "#AB47BC", color: "#ffffff", type: "dark" }, // 深紫
      { background: "#6A1B9A", color: "#ffffff", type: "dark" }, // 深紫红
    ],
    root: {
      background: "#AB47BC",
      color: "#ffffff",
      borderRadius: 8,
    },
    node: {
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "transparent",
    },
  },
];

export const DEFAULT_THEME_ID = "rainbow";

export function getThemeById(id: string): MindMapTheme {
  return (
    MIND_MAP_THEMES.find((theme) => theme.id === id) ||
    MIND_MAP_THEMES.find((theme) => theme.id === DEFAULT_THEME_ID)!
  );
}
