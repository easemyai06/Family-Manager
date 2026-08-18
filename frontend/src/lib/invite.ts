import { Share, Linking, Platform } from "react-native";
import * as ExpoLinking from "expo-linking";

// A tap-to-open deep link that lands on /join and carries the invite code so it
// auto-fills on the Join screen. Resolves to a scheme/universal link on native
// (frontend://join?invite=CODE) and an https path on web.
export function inviteLink(code: string): string {
  return ExpoLinking.createURL("/join", { queryParams: { invite: code } });
}

export function inviteMessage(code: string, familyName?: string): string {
  const link = inviteLink(code);
  const fam = familyName ? `the ${familyName}` : "our family";
  return (
    `Join ${fam} on FamilyHome! 🏡\n\n` +
    `Tap to join — the invite code fills in for you:\n${link}\n\n` +
    `Or open the app, tap "Join a family" and enter code: ${code}`
  );
}

// Robust text share that never throws: RN Share on native, Web Share API /
// clipboard fallback on web (RN's Share.share is unsupported in the browser).
async function shareText(text: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      const nav: any = typeof navigator !== "undefined" ? navigator : null;
      if (nav?.share) {
        await nav.share({ text });
        return;
      }
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(text);
        return;
      }
    } catch {
      // user cancelled or the API is blocked — silently ignore
    }
    return;
  }
  try {
    await Share.share({ message: text });
  } catch {
    // user cancelled the share sheet
  }
}

// Native share sheet with the invite link + code.
export async function shareInvite(code: string, familyName?: string): Promise<void> {
  await shareText(inviteMessage(code, familyName));
}

// Open WhatsApp pre-filled with the invite. Falls back to wa.me, then the
// native share sheet if WhatsApp isn't available. Returns true if WhatsApp opened.
export async function shareInviteWhatsApp(code: string, familyName?: string): Promise<boolean> {
  const text = inviteMessage(code, familyName);
  const encoded = encodeURIComponent(text);
  const targets = [`whatsapp://send?text=${encoded}`, `https://wa.me/?text=${encoded}`];
  for (const url of targets) {
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return true;
      }
    } catch {
      // try next fallback
    }
  }
  await shareText(text);
  return false;
}
