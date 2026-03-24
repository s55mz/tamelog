const APP_HOSTS = new Set([
  "finance-pro.space",
  "www.finance-pro.space",
  "160.251.203.86",
  "localhost",
  "127.0.0.1"
]);

export const APP_HOME_URL = "https://finance-pro.space/";
export const APP_SETTINGS_URL = "https://finance-pro.space/settings";

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isBlockPageRuntime(locationLike = window.location) {
  if (locationLike.port === "8181") {
    return true;
  }

  return !APP_HOSTS.has(locationLike.hostname);
}

export function getBlockedPageContext(locationLike = window.location) {
  const rawPath = `${locationLike.pathname}${locationLike.search}`;
  const decodedPath = safeDecode(rawPath);

  return {
    host: locationLike.hostname,
    path: decodedPath || "/",
    href: locationLike.href
  };
}
