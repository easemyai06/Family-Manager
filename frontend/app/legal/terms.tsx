import React from "react";
import { LegalPage } from "@/src/components/LegalPage";

export default function TermsOfUse() {
  return (
    <LegalPage
      title="Terms of Use"
      updated="June 2026"
      intro="These Terms of Use govern your use of FamilyHome, provided by Ease My Ai Pvt Ltd. By creating an account or using the app, you agree to these terms."
      sections={[
        {
          h: "1. The service",
          p: "FamilyHome is a private family‑organisation app that helps your family coordinate calendars, chores, lists, meals, memories, documents and emergency information. Features may change or be improved over time.",
        },
        {
          h: "2. Eligibility",
          p: "You must be at least 18 years old, or of legal age in your country, to create an account. By creating a family you confirm you are authorised to add and manage information about your family members, including any child profiles.",
        },
        {
          h: "3. Your account",
          p: "You are responsible for keeping your login credentials secure and for all activity under your account. Please provide accurate information and keep it up to date. Notify us promptly of any unauthorised use.",
        },
        {
          h: "4. Acceptable use",
          p: "You agree to use FamilyHome lawfully and respectfully. Do not upload content that is illegal, infringing, or that you do not have the right to share, and do not attempt to disrupt, reverse engineer or gain unauthorised access to the service or other families’ data.",
        },
        {
          h: "5. Your content",
          p: "You keep ownership of the content you add. You grant us a limited licence to store, process and display that content solely to operate the app for you and your family. You are responsible for the content you and your family members contribute.",
        },
        {
          h: "6. Privacy",
          p: "Your use of the app is also governed by our Privacy Policy, which explains how we handle your information. Please review it alongside these terms.",
        },
        {
          h: "7. Account deletion",
          p: "You may delete your account at any time from within the app. If you are the family organizer, deleting your account permanently removes the whole family space and its data. We may suspend or terminate accounts that violate these terms.",
        },
        {
          h: "8. Disclaimers",
          p: "FamilyHome is provided “as is”. It is a family‑organisation tool and is not a substitute for professional medical, legal or emergency services. In a real emergency, always contact your local emergency number first.",
        },
        {
          h: "9. Limitation of liability",
          p: "To the maximum extent permitted by law, Ease My Ai Pvt Ltd is not liable for any indirect, incidental or consequential damages arising from your use of the app, or for any loss of data beyond our reasonable control.",
        },
        {
          h: "10. Changes and governing law",
          p: "We may update these terms; material changes will be posted here with a new date. These terms are governed by the laws of India. Questions? Email info@easemyai.com.",
        },
      ]}
    />
  );
}
