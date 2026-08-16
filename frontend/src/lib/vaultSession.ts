// Lightweight in-memory unlock session for the Family Vault.
// The vault is gated by biometric / PIN; once unlocked it stays open for a
// short window so the user can browse without re-authenticating on every screen.
const WINDOW_MS = 3 * 60 * 1000;
let unlockedUntil = 0;

export const vaultSession = {
  isUnlocked() {
    return Date.now() < unlockedUntil;
  },
  unlock() {
    unlockedUntil = Date.now() + WINDOW_MS;
  },
  touch() {
    if (Date.now() < unlockedUntil) unlockedUntil = Date.now() + WINDOW_MS;
  },
  lock() {
    unlockedUntil = 0;
  },
};
