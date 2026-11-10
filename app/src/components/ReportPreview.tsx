// Phones: the report shown in a web view, just as the .html file will look. The web view is a native
// part (react-native-webview), so only app builds made after it was added have it; loading it on an
// older one would crash at once, so it's loaded only after checking it's there. Older builds say so.
import { NativeModules, TurboModuleRegistry, View } from 'react-native';
import { Muted } from '@/components/ui';
import { colors, space } from '@/lib/theme';

const hasWebView = (() => {
  try {
    return !!(TurboModuleRegistry.get('RNCWebViewModule') ?? NativeModules.RNCWebViewModule);
  } catch {
    return false;
  }
})();

export function ReportPreview({ html }: { html: string }) {
  if (!hasWebView) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, borderRadius: 12, backgroundColor: colors.card }}>
        <Muted>The preview needs the newest version of the app from the App Store. The downloads work already.</Muted>
      </View>
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { WebView } = require('react-native-webview') as typeof import('react-native-webview');
  // No scripts (the report has none), and nothing opens from it: links stay put.
  return (
    <WebView source={{ html }} originWhitelist={['*']} javaScriptEnabled={false}
      onShouldStartLoadWithRequest={(r) => !/^https?:/i.test(r.url)}
      style={{ flex: 1, backgroundColor: 'transparent', borderRadius: 12 }} />
  );
}
