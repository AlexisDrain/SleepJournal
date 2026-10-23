// In-memory AsyncStorage.
const m = new Map();
module.exports = {
  default: {
    async getItem(k) { return m.has(k) ? m.get(k) : null; },
    async setItem(k, v) { m.set(k, v); },
    async removeItem(k) { m.delete(k); },
  },
};
module.exports.__esModule = true;
