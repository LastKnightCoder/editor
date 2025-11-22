// Weather icons configuration - QWeather Icons
// 使用和风天气图标库的官方代码（彩色填充版本）
// 参考：https://icons.qweather.com/icons/

export const WEATHER_ICONS = [
  // 常用天气 - 使用 -fill 彩色版本，并为每个图标指定颜色
  { id: "100-fill", name: "晴天", group: "常用", color: "#FDB813" }, // 金黄色
  { id: "101-fill", name: "多云", group: "常用", color: "#93C5FD" }, // 浅蓝色
  { id: "102-fill", name: "少云", group: "常用", color: "#FBBF24" }, // 橙黄色
  { id: "103-fill", name: "晴间多云", group: "常用", color: "#F59E0B" }, // 橙色
  { id: "104-fill", name: "阴", group: "常用", color: "#9CA3AF" }, // 灰色
  { id: "150-fill", name: "晴（夜间）", group: "常用", color: "#FCD34D" }, // 月亮黄
  { id: "151-fill", name: "多云（夜间）", group: "常用", color: "#60A5FA" }, // 夜蓝色
  { id: "300-fill", name: "阵雨", group: "常用", color: "#60A5FA" }, // 蓝色
  { id: "305-fill", name: "小雨", group: "常用", color: "#3B82F6" }, // 深蓝色
  { id: "306-fill", name: "中雨", group: "常用", color: "#2563EB" }, // 更深蓝色
  { id: "307-fill", name: "大雨", group: "常用", color: "#1E40AF" }, // 深蓝色
  { id: "400-fill", name: "小雪", group: "常用", color: "#93C5FD" }, // 淡蓝色
  { id: "401-fill", name: "中雪", group: "常用", color: "#60A5FA" }, // 浅蓝色
  { id: "402-fill", name: "大雪", group: "常用", color: "#3B82F6" }, // 蓝色
  { id: "500-fill", name: "薄雾", group: "常用", color: "#D1D5DB" }, // 浅灰色
  { id: "501-fill", name: "雾", group: "常用", color: "#9CA3AF" }, // 灰色
  { id: "502-fill", name: "霾", group: "常用", color: "#D97706" }, // 棕黄色
  { id: "503-fill", name: "扬沙", group: "常用", color: "#F59E0B" }, // 橙色
  { id: "504-fill", name: "浮尘", group: "常用", color: "#D97706" }, // 棕色

  // 降雨
  { id: "301-fill", name: "强阵雨", group: "降雨", color: "#2563EB" },
  { id: "302-fill", name: "雷阵雨", group: "降雨", color: "#7C3AED" }, // 紫色
  { id: "303-fill", name: "强雷阵雨", group: "降雨", color: "#6D28D9" }, // 深紫色
  { id: "304-fill", name: "雷阵雨伴有冰雹", group: "降雨", color: "#5B21B6" }, // 更深紫色
  { id: "308-fill", name: "极端降雨", group: "降雨", color: "#1E3A8A" }, // 深蓝色
  { id: "309-fill", name: "毛毛雨", group: "降雨", color: "#93C5FD" }, // 淡蓝色
  { id: "310-fill", name: "暴雨", group: "降雨", color: "#1E40AF" },
  { id: "311-fill", name: "大暴雨", group: "降雨", color: "#1E3A8A" },
  { id: "312-fill", name: "特大暴雨", group: "降雨", color: "#172554" }, // 极深蓝
  { id: "313-fill", name: "冻雨", group: "降雨", color: "#0EA5E9" }, // 青蓝色
  { id: "314-fill", name: "小到中雨", group: "降雨", color: "#3B82F6" },
  { id: "315-fill", name: "中到大雨", group: "降雨", color: "#2563EB" },
  { id: "316-fill", name: "大到暴雨", group: "降雨", color: "#1E40AF" },
  { id: "317-fill", name: "暴雨到大暴雨", group: "降雨", color: "#1E3A8A" },
  { id: "318-fill", name: "大暴雨到特大暴雨", group: "降雨", color: "#172554" },
  { id: "350-fill", name: "阵雨（夜间）", group: "降雨", color: "#3B82F6" },
  { id: "351-fill", name: "强阵雨（夜间）", group: "降雨", color: "#2563EB" },
  { id: "399-fill", name: "雨", group: "降雨", color: "#3B82F6" },

  // 降雪
  { id: "403-fill", name: "暴雪", group: "降雪", color: "#60A5FA" },
  { id: "404-fill", name: "雨夹雪", group: "降雪", color: "#7DD3FC" }, // 青蓝色
  { id: "405-fill", name: "雨雪天气", group: "降雪", color: "#67E8F9" }, // 青色
  { id: "406-fill", name: "阵雨夹雪", group: "降雪", color: "#7DD3FC" },
  { id: "407-fill", name: "阵雪", group: "降雪", color: "#93C5FD" },
  { id: "408-fill", name: "小到中雪", group: "降雪", color: "#BFDBFE" }, // 淡蓝色
  { id: "409-fill", name: "中到大雪", group: "降雪", color: "#93C5FD" },
  { id: "410-fill", name: "大到暴雪", group: "降雪", color: "#60A5FA" },
  { id: "456-fill", name: "阵雨夹雪（夜间）", group: "降雪", color: "#7DD3FC" },
  { id: "457-fill", name: "阵雪（夜间）", group: "降雪", color: "#93C5FD" },
  { id: "499-fill", name: "雪", group: "降雪", color: "#93C5FD" },

  // 雾霾沙尘
  { id: "507-fill", name: "沙尘暴", group: "雾霾沙尘", color: "#F59E0B" }, // 橙色
  { id: "508-fill", name: "强沙尘暴", group: "雾霾沙尘", color: "#D97706" }, // 深橙色
  { id: "509-fill", name: "浓雾", group: "雾霾沙尘", color: "#9CA3AF" },
  { id: "510-fill", name: "强浓雾", group: "雾霾沙尘", color: "#6B7280" }, // 深灰色
  { id: "511-fill", name: "中度霾", group: "雾霾沙尘", color: "#EA580C" }, // 橙红色
  { id: "512-fill", name: "重度霾", group: "雾霾沙尘", color: "#DC2626" }, // 红色
  { id: "513-fill", name: "严重霾", group: "雾霾沙尘", color: "#991B1B" }, // 深红色
  { id: "514-fill", name: "大雾", group: "雾霾沙尘", color: "#9CA3AF" },
  { id: "515-fill", name: "特强浓雾", group: "雾霾沙尘", color: "#6B7280" },

  // 其他
  { id: "900-fill", name: "热", group: "其他", color: "#EF4444" }, // 红色
  { id: "901-fill", name: "冷", group: "其他", color: "#3B82F6" }, // 蓝色
  { id: "999-fill", name: "未知", group: "其他", color: "#6B7280" }, // 灰色
];

// Mood icons configuration
export const MOOD_ICONS = [
  {
    id: "party-popper",
    name: "超开心",
    icon: "party-popper.png",
    disabledIcon: "party-popper-disabled.png",
  },
  {
    id: "smiling-face-with-heart-eyes",
    name: "爱心",
    icon: "smiling-face-with-heart-eyes_1f60d.png",
    disabledIcon: "smiling-face-with-heart-eyes_1f60d-disabled.png",
  },
  {
    id: "smiling-face",
    name: "微笑",
    icon: "smiling-face_263a-fe0f.png",
    disabledIcon: "smiling-face_263a-fe0f-disabled.png",
  },
  {
    id: "slightly-smiling-face",
    name: "轻微笑",
    icon: "slightly-smiling-face_1f642.png",
    disabledIcon: "slightly-smiling-face_1f642-disabled.png",
  },
  {
    id: "neutral-face",
    name: "平静",
    icon: "neutral-face_1f610.png",
    disabledIcon: "neutral-face_1f610-disabled.png",
  },
  {
    id: "downcast-face-with-sweat",
    name: "沮丧",
    icon: "downcast-face-with-sweat_1f613.png",
    disabledIcon: "downcast-face-with-sweat_1f613-disabled.png",
  },
  {
    id: "thumbs-down",
    name: "不好",
    icon: "thumbs-down_1f44e.png",
    disabledIcon: "thumbs-down_1f44e-disabled.png",
  },
  {
    id: "sleeping-face",
    name: "困倦",
    icon: "sleeping-face_1f634.png",
    disabledIcon: "sleeping-face_1f634-disabled.png",
  },
  {
    id: "thumbs-up",
    name: "不错",
    icon: "thumbs-up_1f44d.png",
    disabledIcon: "thumbs-up_1f44d-disabled.png",
  },
];
