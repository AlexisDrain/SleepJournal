// Phones: the report becomes a PDF file, offered through the share sheet (email, Messages, Files…).
// expo-print is loaded only when asked for, so an app built before it was added still opens.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function shareReport(html: string, name: string): Promise<void> {
  let Print: typeof import('expo-print');
  try {
    Print = await import('expo-print');
  } catch {
    throw new Error('Sharing a PDF needs the latest version of the app. Please update it, or use the export buttons meanwhile.');
  }
  const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 }); // A4, landscape
  const named = new File(Paths.cache, `${name}.pdf`);
  if (named.exists) named.delete();
  new File(uri).move(named);
  await Sharing.shareAsync(named.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Share sleep report' });
}
