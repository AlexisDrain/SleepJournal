// Web version: exports download straight to the computer; imports read the picked file.
import type { DocumentPickerAsset } from 'expo-document-picker';

export async function shareFile(name: string, content: string | Uint8Array, mimeType: string, _UTI: string) {
  const blob = new Blob([content as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function readPickedText(asset: DocumentPickerAsset): Promise<string> {
  if (asset.file) return asset.file.text();
  return (await fetch(asset.uri)).text();
}

export async function readPickedBytes(asset: DocumentPickerAsset): Promise<Uint8Array> {
  return new Uint8Array(await (asset.file ?? (await fetch(asset.uri))).arrayBuffer());
}
