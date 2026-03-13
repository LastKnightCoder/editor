import type { WeReadCookie, WeReadLoginResult } from "@/types/weread";

export const extractUserInfo = (cookies: WeReadCookie[]) => {
  const userName = safeDecode(
    cookies.find((cookie) => cookie.name === "wr_name")?.value || "",
  );
  const userVid = safeDecode(
    cookies.find((cookie) => cookie.name === "wr_vid")?.value || "",
  );
  return {
    userName,
    userVid,
  };
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const buildLoginResultFromCookies = (
  cookies: WeReadCookie[],
): WeReadLoginResult | null => {
  const { userName, userVid } = extractUserInfo(cookies);
  if (!userName || !userVid) {
    return null;
  }
  return {
    cookies,
    userName,
    userVid,
  };
};

export const getLoginResultFromSession = async (
  session: Electron.Session,
  url: string,
): Promise<WeReadLoginResult | null> => {
  const cookies = await session.cookies.get({ url });
  const normalizedCookies = cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
  }));
  return buildLoginResultFromCookies(normalizedCookies);
};
