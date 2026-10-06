// "Are you sure?" that works everywhere: a native alert on phones, the browser's dialog on the web
// (React Native Web's Alert doesn't show buttons).
import { Alert, Platform } from 'react-native';

export function confirmAction(title: string, message: string | undefined, actionLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: actionLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}
