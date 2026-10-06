// Small secrets (the Google Sheet connection code): the iPhone Keychain / Android Keystore.
// (Web: secureStorage.web.ts)
import * as SecureStore from 'expo-secure-store';

export const secureStorage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
