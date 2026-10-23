// In-memory expo-notifications. Every call yields first, like the real (async, native) module,
// so overlapping callers interleave the way they can on a phone.
const tick = () => new Promise((r) => setTimeout(r, Math.random() * 5));
const scheduled = new Map();
module.exports = {
  __scheduled: scheduled,
  setNotificationHandler() {},
  useLastNotificationResponse: () => null,
  SchedulableTriggerInputTypes: { DATE: 'date' },
  async getAllScheduledNotificationsAsync() { await tick(); return [...scheduled.keys()].map((identifier) => ({ identifier })); },
  async cancelScheduledNotificationAsync(id) { await tick(); scheduled.delete(id); },
  async cancelAllScheduledNotificationsAsync() { await tick(); scheduled.clear(); },
  async scheduleNotificationAsync({ identifier, trigger }) { await tick(); scheduled.set(identifier, trigger.date); return identifier; },
  async getPermissionsAsync() { return { granted: true }; },
  async requestPermissionsAsync() { return { granted: true }; },
};
