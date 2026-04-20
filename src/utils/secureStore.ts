import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { networkInterfaces, hostname, userInfo } from 'os';

/**
 * Derives a machine-specific encryption key based on hardware/OS details.
 * This ensures that if settings.json is copied to another machine, the keys cannot be decrypted.
 */
function getMachineKey(): Buffer {
  let hardwareInfo = hostname() + userInfo().username;
  const interfaces = networkInterfaces();
  
  // Try to find a stable MAC address (ignore internal/virtual ones if possible)
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (iface && iface.length > 0 && !iface[0].internal && iface[0].mac !== '00:00:00:00:00:00') {
      hardwareInfo += iface[0].mac;
      break;
    }
  }

  // Fallback hardware info
  hardwareInfo += 'openclaude-secure-salt-2026';

  // Create a 256-bit (32 byte) key
  return createHash('sha256').update(hardwareInfo).digest();
}

const ALGORITHM = 'aes-256-gcm';

import { getSecretSync, setSecretSync } from './keychain.js';

/**
 * Encrypts a plaintext string (like an API key).
 * Stores it in OS Keychain and returns a reference ID.
 */
export function encryptSecret(text: string): string {
  if (!text) return text;
  if (text.startsWith('ENC:v1:')) return text; // legacy
  if (text.startsWith('ENC:keychain:')) return text; // Already stored
  try {
    const uuid = randomBytes(16).toString('hex');
    setSecretSync(uuid, text);
    
    // Format: "ENC:keychain:UUID"
    return `ENC:keychain:${uuid}`;
  } catch (err) {
    // Fallback to plaintext if encryption fails for some reason
    return text;
  }
}

/**
 * Decrypts a previously encrypted secret.
 * If the string isn't encrypted, it returns the string as-is.
 */
export function decryptSecret(encryptedText: string): string {
  if (!encryptedText || typeof encryptedText !== 'string') {
    return encryptedText;
  }

  // Handle new keychain format
  if (encryptedText.startsWith('ENC:keychain:')) {
    const uuid = encryptedText.substring('ENC:keychain:'.length);
    const val = getSecretSync(uuid);
    return val ? val : encryptedText;
  }

  // Handle legacy v1 format
  if (encryptedText.startsWith('ENC:v1:')) {
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 5) return encryptedText;

      const [, , ivStr, authTagStr, dataStr] = parts;
      const key = getMachineKey();
      const iv = Buffer.from(ivStr, 'base64');
      const authTag = Buffer.from(authTagStr, 'base64');
      
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(dataStr, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (err) {
      return '';
    }
  }

  return encryptedText;
}

export function encryptConfigSecretsDeep(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(encryptConfigSecretsDeep);
  
  const result = { ...obj };
  for (const k of Object.keys(result)) {
    if ((k === 'apiKey' || k === 'api_key') && typeof result[k] === 'string') {
      result[k] = encryptSecret(result[k]);
    } else if (typeof result[k] === 'object') {
      result[k] = encryptConfigSecretsDeep(result[k]);
    }
  }
  return result;
}

export function decryptConfigSecretsDeep(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(decryptConfigSecretsDeep);
  
  const result = { ...obj };
  for (const k of Object.keys(result)) {
    if ((k === 'apiKey' || k === 'api_key') && typeof result[k] === 'string') {
      result[k] = decryptSecret(result[k]);
    } else if (typeof result[k] === 'object') {
      result[k] = decryptConfigSecretsDeep(result[k]);
    }
  }
  return result;
}
