import * as ImagePicker from "expo-image-picker";
import { Alert, Linking, Platform } from "react-native";

type PickOpts = { allowsEditing?: boolean; aspect?: [number, number] };

async function ensurePermission(kind: "camera" | "library"): Promise<boolean> {
  const get = kind === "camera" ? ImagePicker.getCameraPermissionsAsync : ImagePicker.getMediaLibraryPermissionsAsync;
  const req = kind === "camera" ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
  const perm = await get();
  let status = perm.status;
  if (status !== "granted" && perm.canAskAgain) status = (await req()).status;
  if (status !== "granted") {
    Alert.alert(
      kind === "camera" ? "Camera access needed" : "Photo access needed",
      kind === "camera" ? "Allow camera access to take a photo." : "Allow photo access to choose an image.",
      [{ text: "Not now", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]
    );
    return false;
  }
  return true;
}

/** Launch the camera or photo library and return the picked local URI (or null). */
export async function launchPicker(source: "camera" | "library", opts?: PickOpts): Promise<string | null> {
  const ok = await ensurePermission(source === "camera" ? "camera" : "library");
  if (!ok) return null;
  const common = { quality: 0.6, allowsEditing: opts?.allowsEditing, aspect: opts?.aspect } as const;
  const res =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(common)
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], ...common });
  if (res.canceled || !res.assets?.length) return null;
  return res.assets[0].uri;
}

/**
 * Present a native action sheet ("Take a photo" / "Choose from library") and call
 * `onPick` with the chosen local URI. On web the camera isn't reliable, so it goes
 * straight to the library.
 */
export function choosePhoto(label: string, onPick: (uri: string) => void, opts?: PickOpts) {
  if (Platform.OS === "web") {
    launchPicker("library", opts).then((u) => u && onPick(u));
    return;
  }
  Alert.alert(`Add ${label}`, undefined, [
    { text: "Take a photo", onPress: () => launchPicker("camera", opts).then((u) => u && onPick(u)) },
    { text: "Choose from library", onPress: () => launchPicker("library", opts).then((u) => u && onPick(u)) },
    { text: "Cancel", style: "cancel" },
  ]);
}
