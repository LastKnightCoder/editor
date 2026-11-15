import { BROWSER_COMPANION_DEEP_LINK } from "@tau/shared/browser-companion";

export function isBrowserCompanionDeepLink(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      `${url.protocol}//${url.host}` === BROWSER_COMPANION_DEEP_LINK &&
      !url.username &&
      !url.password &&
      (url.pathname === "" || url.pathname === "/") &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export const getDeepLinkFromArgs = (args: string[]): string | undefined =>
  args.find(value => /^tau:/i.test(value));
