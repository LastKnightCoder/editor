// 反馈附带的环境信息里，系统版本从 UA 解析即可满足排障需要（Android 14 / iOS 17.2），
// 避免为此走 JNI / objc2。

export function osVersionFromUserAgent(userAgent: string): string {
  const android = /Android\s+([\d.]+)/i.exec(userAgent);
  if (android) return `Android ${android[1]}`;
  const ios = /(?:iPhone|iPad|CPU) OS\s+([\d_]+)/i.exec(userAgent);
  if (ios) return `iOS ${ios[1].replace(/_/g, ".")}`;
  return "";
}
