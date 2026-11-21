import { createHmac, randomUUID } from "node:crypto";

export const MAX_TRIES = 5;
export const LOCK_MINUTES = 15;

/** "  Big   Mike " -> "big mike". Sign-in names are matched without caring about case or extra spaces. */
export function nameKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function cleanName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 24);
}

export function validName(name: string) {
  return /^[\p{L}\p{N} .'_-]{2,24}$/u.test(cleanName(name));
}

export function validPin(pin: string) {
  return /^\d{4}$/.test(pin);
}

/** Each PIN player gets a private placeholder email that is never shown or mailed. */
export function placeholderEmail() {
  return `pin-${randomUUID()}@players.pickem.invalid`;
}

/**
 * The account password is a keyed hash of the PIN, never the PIN itself. Without the server's
 * secret, nobody can try PINs against the login service directly; every try goes through our
 * sign-in, which locks the name after a few misses.
 */
export function pinPassword(userId: string, pin: string) {
  const key = process.env.PIN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Server is missing its secret key");
  return createHmac("sha256", key).update(`${userId}:${pin}`).digest("hex");
}
