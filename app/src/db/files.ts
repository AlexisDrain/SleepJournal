// Saving an export and reading a picked file, on the phone. (Web: files.web.ts)
import type { DocumentPickerAsset } from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Writes the file to the cache and opens the share sheet (Files, Drive, Sheets, email…). */
export async function shareFile(name: string, content: string | Uint8Array, mimeType: string, UTI: string) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType, UTI, dialogTitle: 'Export sleep journal' });
}

export async function readPickedText(asset: DocumentPickerAsset): Promise<string> {
  return new File(asset.uri).textSync();
}

export async function readPickedBytes(asset: DocumentPickerAsset): Promise<Uint8Array> {
  return new File(asset.uri).bytes();
}
