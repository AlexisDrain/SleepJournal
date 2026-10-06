// Browsers have no keychain, so on the web the connection code lives in this site's localStorage:
// readable only by this site in this browser, but not encrypted. Use the web app on your own devices.
const store = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const secureStorage = {
  get: async (key: string) => store()?.getItem(key) ?? null,
  set: async (key: string, value: string) => store()?.setItem(key, value),
  remove: async (key: string) => store()?.removeItem(key),
};
