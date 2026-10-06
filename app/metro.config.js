// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite on the web runs SQLite compiled to WebAssembly.
// (The app only uses expo-sqlite's async functions, which work without the
// cross-origin-isolation headers that its synchronous functions would need.)
config.resolver.assetExts.push('wasm');

module.exports = config;
