import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';

function chave(): Buffer {
  const hex = env.parametrosEncryptionKey();
  const buffer = Buffer.from(hex, 'hex');
  if (buffer.length !== 32) {
    throw new Error('PARAMETROS_ENCRYPTION_KEY deve ter 32 bytes (64 caracteres hex).');
  }
  return buffer;
}

/** Formato persistido: `<iv hex>:<authTag hex>:<ciphertext hex>` */
export function criptografar(textoPlano: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, chave(), iv);
  const ciphertext = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function descriptografar(valorCriptografado: string): string {
  const [ivHex, authTagHex, ciphertextHex] = valorCriptografado.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Valor criptografado em formato inválido.');
  }
  const decipher = createDecipheriv(ALGORITHM, chave(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}
