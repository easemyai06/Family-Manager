import { Linking } from "react-native";

export function callNumber(phone?: string | null) {
  if (!phone) return;
  Linking.openURL(`tel:${phone.replace(/[^0-9+]/g, "")}`);
}

export function openWhatsApp(phone?: string | null) {
  if (!phone) return;
  Linking.openURL(`https://wa.me/${phone.replace(/[^0-9]/g, "")}`);
}
