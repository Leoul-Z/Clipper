import crypto from 'crypto';

export function generateVerificationCode(platform: 'YT' | 'IG' | 'TT'): string {
  const randomBytes = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 chars
  return `CLIP-${platform}-${randomBytes}`;
}
