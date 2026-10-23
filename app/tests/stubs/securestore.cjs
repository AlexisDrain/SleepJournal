const m = new Map();
module.exports = {
  async getItemAsync(k) { return m.get(k) ?? null; },
  async setItemAsync(k, v) { m.set(k, v); },
  async deleteItemAsync(k) { m.delete(k); },
};
