export enum EGithubCDN {
  JsDelivr = "jsdelivr",
  Statically = "statically",
}

export const GithubCDNOptions = [
  {
    label: "jsDelivr",
    value: EGithubCDN.JsDelivr,
  },
  {
    label: "Statically",
    value: EGithubCDN.Statically,
  },
];
