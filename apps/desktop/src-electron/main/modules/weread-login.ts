import type { WeReadCookie, WeReadLoginResult } from "@/types/weread";

export const extractUserInfo = (cookies: WeReadCookie[]) => {
  const userName =
    cookies.find((cookie) => cookie.name === "wr_name")?.value || "";
  const userVid =
    cookies.find((cookie) => cookie.name === "wr_vid")?.value || "";
  return {
    userName,
    userVid,
  };
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
