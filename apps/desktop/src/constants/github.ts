export enum EGithubCDN {
  JsDelivr = "jsdelivr",
  Statically = "statically",
}

export const GITHUB_CDN_NONE_VALUE = "none";

export const GithubCDNOptions = [
  {
    label: "不使用 CDN",
    value: GITHUB_CDN_NONE_VALUE,
  },
  {
    label: "jsDelivr",
    value: EGithubCDN.JsDelivr,
  },
  {
    label: "Statically",
    value: EGithubCDN.Statically,
  },
];
