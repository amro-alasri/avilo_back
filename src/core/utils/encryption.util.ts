import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Utility for symmetric encryption and decryption.
 * Uses ENCRYPTION_KEY or JWT_SECRET from environment variables.
 */
export class EncryptionUtil {
  private static getKey(): Buffer {
    const keyStr = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'avilo-default-fallback-secret-2026';
    // Ensure the key is exactly 32 bytes for aes-256-cbc by hashing it
    return crypto.createHash('sha256').update(String(keyStr)).digest();
  }

  /**
   * Encrypts a string to iv:encryptedData format
   */
  static encrypt(text: string): string {
    if (!text) return text;

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.getKey(), iv);

    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  /**
   * Decrypts an iv:encryptedData string
   */
  static decrypt(text: string): string {
    if (!text) return text;

    const textParts = text.split(':');
    if (textParts.length !== 2) {
      // If not in encrypted format, return as is
      return text;
    }

    try {
      const iv = Buffer.from(textParts[0], 'hex');
      const encryptedText = Buffer.from(textParts[1], 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM, this.getKey(), iv);

      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted.toString('utf8');
    } catch {
      // If decryption fails, return original text safely
      return text;
    }
  }
}
