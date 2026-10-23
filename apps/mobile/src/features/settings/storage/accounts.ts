// 集成账号是否齐全：同步服务与上传服务的「是否已配置」都要先满足这一条。

import type { SettingCompat } from "../../../types";

export const accountReady = {
  s3: (s: SettingCompat) =>
    Boolean(s.integration.s3.accessKeyId && s.integration.s3.secretAccessKey),
  aliOSS: (s: SettingCompat) =>
    Boolean(s.integration.aliOSS.accessKeyId && s.integration.aliOSS.accessKeySecret),
  github: (s: SettingCompat) =>
    Boolean(s.integration.github.token && s.integration.github.user.name),
  webdav: (s: SettingCompat) =>
    Boolean(
      s.integration.webdav.url && s.integration.webdav.username && s.integration.webdav.password
    ),
};
