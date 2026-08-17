import React from "react";
import { LegalPage } from "@/src/components/LegalPage";

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="June 2026"
      intro="FamilyHome is operated by Ease My Ai Pvt Ltd (“we”, “us”). We built FamilyHome as a private space for your family, so protecting your information matters to us. This policy explains what we collect, why, and the choices you have."
      sections={[
        {
          h: "1. Information you provide",
          p: "When you create an account we collect your name, email address and a securely hashed password. Inside the app you may add family content such as posts, photos and videos, calendar events, chores, shopping and to‑do lists, meal plans, recipes, memories, wish lists, and sensitive family records like documents, insurance, medical cards and emergency contacts. You choose what to add.",
        },
        {
          h: "2. How we use your information",
          p: "We use your information only to provide the app’s features to you and your family — for example to show your calendar, sync your lists, deliver family chat messages and reminders, and keep your Family Vault and emergency information available to the right people. We do not sell your personal data and we do not use it for advertising.",
        },
        {
          h: "3. Who can see your data",
          p: "Your content is visible only to members of your family group. Some items (such as private Vault documents, medical cards and secret gifts) have additional visibility controls that you set. A parent may grant a trusted adult view‑only emergency access; this can be turned off at any time.",
        },
        {
          h: "4. Storage and security",
          p: "Data is stored on secure, access‑controlled cloud infrastructure. Uploaded photos, videos and documents are kept in private object storage and are not publicly listed. Passwords are stored only as salted hashes. While no online service can be guaranteed 100% secure, we take reasonable technical and organisational measures to protect your data.",
        },
        {
          h: "5. Service providers",
          p: "We rely on trusted third parties strictly to operate the app — for example cloud hosting and database, private media storage, transactional email delivery (calendar invites), and push‑notification delivery. These providers process data only on our behalf.",
        },
        {
          h: "6. Children",
          p: "FamilyHome is designed to be used by families. Child profiles and any information about children are created and managed by a parent or guardian within the family group. Children are not asked to provide personal information directly, and child content stays within the private family group.",
        },
        {
          h: "7. Data retention and deletion",
          p: "You can delete your account at any time from More → Account & Data → Delete Account. Deleting a member‑only account removes your login and profile. If you are the family organizer, deleting your account permanently removes the entire family space and all of its data. Deletions are permanent and cannot be undone.",
        },
        {
          h: "8. Your rights",
          p: "You may access, correct or delete your information from within the app. To request help exercising any privacy right, contact us using the details below and we will respond within a reasonable time.",
        },
        {
          h: "9. Changes to this policy",
          p: "We may update this policy from time to time. Material changes will be reflected here with a new “Last updated” date. Continued use of the app after changes means you accept the updated policy.",
        },
        {
          h: "10. Contact us",
          p: "Ease My Ai Pvt Ltd — email info@easemyai.com for any privacy questions or requests.",
        },
      ]}
    />
  );
}
