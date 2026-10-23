import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

export type CompressedImage = { dataUrl: string; uri: string; width: number; height: number; length: number };

export async function pickCompressedImage(maxDataUrlLength = 360_000): Promise<CompressedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("PHOTO_PERMISSION_DENIED");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: 1,
    exif: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const initialWidth = Math.min(asset.width || 1600, 1600);
  const widths = [initialWidth, 1280, 1024, 840, 720, 600];
  const qualities = [0.78, 0.68, 0.58, 0.48];
  let best: CompressedImage | null = null;
  for (const width of [...new Set(widths)]) {
    for (const quality of qualities) {
      const result = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width } }],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!result.base64) continue;
      const dataUrl = `data:image/jpeg;base64,${result.base64}`;
      const candidate = { dataUrl, uri: result.uri, width: result.width, height: result.height, length: dataUrl.length };
      if (!best || candidate.length < best.length) best = candidate;
      if (candidate.length <= maxDataUrlLength) return candidate;
    }
  }
  if (best && best.length <= maxDataUrlLength) return best;
  throw new Error("IMAGE_TOO_LARGE_AFTER_COMPRESSION");
}

export function mediaErrorMessage(error: unknown) {
  const code = String((error as Error)?.message || "");
  if (code === "PHOTO_PERMISSION_DENIED") return "اسمح للتطبيق بالوصول إلى مكتبة الصور من إعدادات iPhone.";
  if (code === "IMAGE_TOO_LARGE_AFTER_COMPRESSION") return "الصورة ما زالت كبيرة بعد الضغط. اختر صورة أخرى أصغر.";
  if (code.includes("CANCEL")) return "تم إلغاء اختيار الصورة.";
  return "تعذر تجهيز الصورة. حاول مرة أخرى.";
}
