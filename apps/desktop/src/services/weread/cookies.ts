import type { WeReadCookie } from "@/types/weread";

export const parseCookieString = (cookieInput: string): WeReadCookie[] => {
  if (!cookieInput) {
    return [];
  }

  return cookieInput
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .map((cookie) => {
      const eqIndex = cookie.indexOf("=");
      if (eqIndex === -1) {
        return { name: cookie, value: "" };
      }
      const rawName = cookie.slice(0, eqIndex).trim();
      const rawValue = cookie.slice(eqIndex + 1).trim();
      return {
        name: safeDecode(rawName),
        value: safeDecode(rawValue),
      };
    });
};

export const serializeCookies = (cookies: WeReadCookie[]): string => {
  return cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
};

export const mergeCookieArray = (
  source: WeReadCookie[],
  updates: WeReadCookie[],
): WeReadCookie[] => {
  const next = [...source];
  updates.forEach((update) => {
    const idx = next.findIndex((item) => item.name === update.name);
    if (idx >= 0) {
      next[idx] = update;
    } else {
      next.push(update);
    }
  });
  return next;
};

export const hasValidWeReadSession = (cookies: WeReadCookie[]): boolean => {
  const userName = cookies.find((cookie) => cookie.name === "wr_name");
  const userVid = cookies.find((cookie) => cookie.name === "wr_vid");
  return Boolean(userName?.value && userVid?.value);
};

export const extractWeReadUserInfo = (cookies: WeReadCookie[]) => {
  const name = cookies.find((cookie) => cookie.name === "wr_name")?.value ?? "";
  const vid = cookies.find((cookie) => cookie.name === "wr_vid")?.value ?? "";
  return { name, vid, isConnected: Boolean(name && vid) };
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
