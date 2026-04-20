/**
 * apiKeyVault.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Keychain Vault for OpenClaude provider API keys.
 *
 * Stores API keys (OPENAI_API_KEY, GEMINI_API_KEY, CODEX_API_KEY, etc.)
 * inside the OS native credential store instead of plaintext files:
 *   • Windows  → Windows Credential Locker (PasswordVault)
 *   • macOS    → macOS Keychain (security CLI)
 *   • Linux    → Secret Service / GNOME Keyring (secret-tool)
 *   • Fallback → AES-256-GCM encrypted in ~/.claude/.credentials.json
 *
 * Usage:
 *   import { saveApiKey, loadApiKey, deleteApiKey, listApiKeyIds } from './apiKeyVault.js'
 *
 *   // Save:
 *   saveApiKey('openai-profile-1', 'sk-...')
 *
 *   // Load:
 *   const key = loadApiKey('openai-profile-1') // returns 'sk-...' or undefined
 *
 *   // Delete:
 *   deleteApiKey('openai-profile-1')
 *
 *   // List stored key IDs (without values):
 *   const ids = listApiKeyIds()
 */

import { getSecureStorage } from './index.js'

// ─── Internal helpers ──────────────────────────────────────────────────────

function readVaultData(): Record<string, string> {
  try {
    const storage = getSecureStorage()
    const data = storage.read()
    return data?.providerApiKeys ?? {}
  } catch {
    return {}
  }
}

function writeVaultData(keys: Record<string, string>): boolean {
  try {
    const storage = getSecureStorage()
    const existing = storage.read() ?? {}
    const result = storage.update({
      ...existing,
      providerApiKeys: keys,
    })
    return result.success
  } catch {
    return false
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Save an API key to the OS Keychain.
 * @param profileId  Stable identifier for this key (e.g. 'openai-default', 'gemini-work')
 * @param apiKey     The raw API key value to protect
 * @returns          true if saved successfully, false otherwise
 */
export function saveApiKey(profileId: string, apiKey: string): boolean {
  if (!profileId || !apiKey) return false
  const current = readVaultData()
  current[profileId] = apiKey
  return writeVaultData(current)
}

/**
 * Load an API key from the OS Keychain.
 * @param profileId  The same identifier used when saving
 * @returns          The raw API key, or undefined if not found
 */
export function loadApiKey(profileId: string): string | undefined {
  if (!profileId) return undefined
  const vault = readVaultData()
  return vault[profileId] || undefined
}

/**
 * Delete an API key from the OS Keychain.
 * @param profileId  The identifier of the key to remove
 * @returns          true if deleted (or was already absent), false on error
 */
export function deleteApiKey(profileId: string): boolean {
  if (!profileId) return true
  const current = readVaultData()
  if (!(profileId in current)) return true
  delete current[profileId]
  return writeVaultData(current)
}

/**
 * List all stored profile IDs (key names only, never values).
 * Safe to log; values are never returned by this function.
 */
export function listApiKeyIds(): string[] {
  return Object.keys(readVaultData())
}

/**
 * Check whether a key is stored for the given profile.
 */
export function hasApiKey(profileId: string): boolean {
  if (!profileId) return false
  const vault = readVaultData()
  return profileId in vault && Boolean(vault[profileId])
}

/**
 * Migrate a plaintext key from the profile file into the vault.
 * Stores the key in the vault and returns true, or returns false
 * if the key was already vaulted or there was nothing to migrate.
 *
 * Call this once on startup to transparently upgrade existing profiles.
 */
export function migrateKeyToVault(
  profileId: string,
  plaintextKey: string | undefined,
): boolean {
  if (!profileId || !plaintextKey) return false
  if (hasApiKey(profileId)) return false   // already vaulted
  return saveApiKey(profileId, plaintextKey)
}
