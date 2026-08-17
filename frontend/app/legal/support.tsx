import React from "react";
import { View, Linking } from "react-native";
import { LegalPage } from "@/src/components/LegalPage";
import { Button } from "@/src/components/ui/Button";
import { AppText } from "@/src/components/ui/AppText";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";

const SUPPORT_EMAIL = "info@easemyai.com";

export default function Support() {
  const { c } = useTheme();

  const emailUs = () => {
    const subject = encodeURIComponent("FamilyHome support request");
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() => {});
  };

  return (
    <LegalPage
      title="Help & Support"
      intro="We’d love to help. Whether you’ve hit a bug, have a question, or want to suggest a feature, our team at Ease My Ai Pvt Ltd is here for you."
      sections={[
        {
          h: "Contact us",
          p: `Email us at ${SUPPORT_EMAIL} and we’ll get back to you as soon as we can, usually within 1–2 business days.`,
        },
        {
          h: "Managing your family",
          p: "Invite family members from More → Invite Family by sharing your family code. Anyone with the code can join your family space.",
        },
        {
          h: "Your privacy & data",
          p: "You control your information. You can edit your profile, manage what’s shared, and delete your account and data anytime from More → Account & Data.",
        },
        {
          h: "In an emergency",
          p: "FamilyHome helps you keep emergency contacts and medical info handy, but it is not an emergency service. Always call your local emergency number first in a real emergency.",
        },
      ]}
      footer={
        <View style={{ marginTop: spacing.sm }}>
          <Button label={`Email ${SUPPORT_EMAIL}`} onPress={emailUs} testID="support-email" />
          <View style={{ backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg }}>
            <AppText size={12} color={c.onSurfaceTertiary} center>
              FamilyHome · by Ease My Ai Pvt Ltd
            </AppText>
          </View>
        </View>
      }
    />
  );
}
