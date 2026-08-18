# FamilyHome — App Privacy / Data Safety Answers

Transcribe these into **App Store Connect → App Privacy** and **Google Play Console → Data safety**. Derived from the in-app Privacy Policy (`/api/legal/privacy`).

**Key facts that shape every answer:**
- The app is account-based, so collected data is **linked to the user's identity**.
- **No ads, no third-party analytics/attribution SDKs, no tracking.** So: ATT not used; nothing is "used to track you."
- Data is shared only with **service providers processing on our behalf** (hosting/DB, private media storage, transactional email, push delivery) — not sold, not shared for others' own use.
- Users can **delete their account** in-app (More → Account & Data → Delete Account).

---

## Apple App Store Connect — "App Privacy"

### Does your app collect data? → **YES**
For every type below: **Linked to the user = Yes**, **Used for tracking = No**, **Purpose = App Functionality** (unless noted).

| Apple data type | Collected | Notes |
|---|---|---|
| Contact Info → **Name** | Yes | Account profile |
| Contact Info → **Email Address** | Yes | Account login (email or Apple/Google) |
| Health & Fitness → **Health** | Yes | Optional medical cards: blood group, allergies, medications (user-entered) |
| User Content → **Photos or Videos** | Yes | Posts, albums, profile photos, document scans |
| User Content → **Other User Content** | Yes | Events, lists, notices, memories, wish lists, vault items, chat messages |
| Identifiers → **User ID** | Yes | Internal account ID |
| Location → **Precise Location** | Yes | Optional, only when a user triggers SOS and grants permission |
| Sensitive Info | Yes | Health/medical info counts as sensitive (user-entered) |
| Contacts (device address book) | **No** | Emergency contacts are typed in manually, not imported |
| Purchases / Financial Info | No | No in-app purchases |
| Browsing/Search History | No | — |
| Diagnostics / Usage Data | No | No analytics or crash SDKs |
| Advertising Data / IDFA | No | No ads |

- **Data used to track you:** **None.**
- **Data linked to you:** all "Yes" rows above.
- **Data not linked to you:** none.

---

## Google Play Console — "Data safety"

- **Does your app collect or share user data?** → **Yes, collects**
- **Is all data encrypted in transit?** → **Yes** (HTTPS/TLS everywhere)
- **Do you provide a way to request data deletion?** → **Yes** — in-app account deletion (More → Account & Data), plus contact `info@easemyai.com`.

For every type: **Collected = Yes**, **Shared = No** (only processors on our behalf), **Processed ephemerally = No**, **Required or optional** as noted, **Purpose = App functionality** (and *Account management* for name/email).

| Play data category → type | Collected | Optional? |
|---|---|---|
| Personal info → **Name** | Yes | Required |
| Personal info → **Email address** | Yes | Required |
| Personal info → **User IDs** | Yes | Required |
| Health & fitness → **Health info** | Yes | Optional (medical cards) |
| Photos and videos → **Photos / Videos** | Yes | Optional |
| Messages → **Other in-app messages** | Yes | Optional (family chat) |
| Location → **Approximate/Precise location** | Yes | Optional (SOS only) |
| Files & docs → **Files and docs** | Yes | Optional (Family Vault) |
| App activity / App info & performance | No | — |
| Financial info | No | — |
| Contacts (device) | No | — |

- **Data shared with third parties:** **None** for their own use. (Service providers who process on our behalf are not "sharing" under Play's definition.)

---

### Consistency checklist (avoid rejection)
- These answers must match the in-app Privacy Policy — they do (accounts, family content, photos/docs, medical info, optional SOS location, no ads/tracking, deletion available).
- If you later add analytics, crash reporting, or ads, **update both stores' forms** and the privacy policy.
- Privacy Policy URL for both stores: `https://<your-domain>/api/legal/privacy` (after deploy).
