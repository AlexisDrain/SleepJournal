// The website's "Get Mobile App" tab: where to get the iPhone and Android apps. Each link opens in a
// new browser tab. The phone apps have no such tab (they're already the app).
import { Redirect } from 'expo-router';
import { Linking, Platform, ScrollView } from 'react-native';
import { Button, Card, Muted, styles } from '@/components/ui';
import { APK_URL, APP_STORE_URL } from '@/lib/links';
import { colors } from '@/lib/theme';
import { NARROW_PAGE, page } from '@/lib/useLayout';

const open = (url: string) => () => void Linking.openURL(url).catch(() => {}); // a new tab on the web

export default function GetAppScreen() {
  if (Platform.OS !== 'web') return <Redirect href="/" />;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.scroll, page(NARROW_PAGE)]}>
      <Card title="iPhone">
        <Button title={"App Store ↗\uFE0E"} onPress={open(APP_STORE_URL)} />
        <Muted>Free on the App Store.</Muted>
      </Card>
      <Card title="Android">
        <Button title={"Download the APK ↗\uFE0E"} onPress={open(APK_URL)} color={colors.morning} />
        <Muted>
          Free on GitHub: download the .apk file from the latest release and open it on your phone. Android asks
          you to allow installing apps from your browser the first time. The app checks GitHub for new versions
          (you can turn that off in Settings).
        </Muted>
      </Card>
      <Muted>
        Your journal stays on each device. To bring it to your phone, export it here (Settings → Your data) and
        import it there, or connect the same Google Sheet on both.
      </Muted>
    </ScrollView>
  );
}
