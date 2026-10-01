/** 驾驶舱卡片共用类串（项目页的网格卡 / 续读卡同用） */

/** 卡片落在列表页那张纸上：细描边分隔，hover 时 lift 轻抬阴影、描边隐去（同 Skill 页卡片；
    纸上再叠阴影卡会糊成一片） */
export const CARD_HOVER =
  "border border-line-1 transition-[box-shadow,border-color] duration-200 hover:shadow-lift hover:border-transparent";
