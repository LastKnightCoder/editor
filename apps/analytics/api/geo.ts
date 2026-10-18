const provinces: Record<string, [string, string]> = {
  BJ: ["11", "北京市"],
  TJ: ["12", "天津市"],
  HE: ["13", "河北省"],
  SX: ["14", "山西省"],
  NM: ["15", "内蒙古自治区"],
  LN: ["21", "辽宁省"],
  JL: ["22", "吉林省"],
  HL: ["23", "黑龙江省"],
  SH: ["31", "上海市"],
  JS: ["32", "江苏省"],
  ZJ: ["33", "浙江省"],
  AH: ["34", "安徽省"],
  FJ: ["35", "福建省"],
  JX: ["36", "江西省"],
  SD: ["37", "山东省"],
  HA: ["41", "河南省"],
  HB: ["42", "湖北省"],
  HN: ["43", "湖南省"],
  GD: ["44", "广东省"],
  GX: ["45", "广西壮族自治区"],
  HI: ["46", "海南省"],
  CQ: ["50", "重庆市"],
  SC: ["51", "四川省"],
  GZ: ["52", "贵州省"],
  YN: ["53", "云南省"],
  XZ: ["54", "西藏自治区"],
  SN: ["61", "陕西省"],
  GS: ["62", "甘肃省"],
  QH: ["63", "青海省"],
  NX: ["64", "宁夏回族自治区"],
  XJ: ["65", "新疆维吾尔自治区"],
  TW: ["71", "台湾地区"],
  HK: ["91", "香港特别行政区"],
  MO: ["92", "澳门特别行政区"],
};
const cnLabels = Object.fromEntries(
  Object.values(provinces).map(([code, label]) => [`CN-${code}`, label])
);

export function geolocation(request: Request): { country: string; region_code: string } {
  const cf = (request as Request & { cf?: { country?: string; regionCode?: string } }).cf;
  const suppliedCountry = cf?.country ?? "ZZ";
  const country = /^[A-Z]{2}$/.test(suppliedCountry) ? suppliedCountry : "ZZ";
  let region = (cf?.regionCode ?? "").toUpperCase().replace(new RegExp(`^${country}-`), "");
  if (country === "CN")
    region =
      provinces[region]?.[0] ?? (/^\d{2}$/.test(region) && cnLabels[`CN-${region}`] ? region : "");
  if (!/^[A-Z0-9-]{1,8}$/.test(region)) region = "";
  return { country, region_code: region ? `${country}-${region}` : `${country}-unknown` };
}

export function regionLabel(code: string): string {
  return (
    cnLabels[code] ??
    (
      {
        "ZZ-unknown": "未知地区",
        "CN-unknown": "中国·省份未知",
        "HK-unknown": "香港特别行政区",
        "MO-unknown": "澳门特别行政区",
        "TW-unknown": "台湾地区",
      } as Record<string, string>
    )[code] ??
    code
  );
}
