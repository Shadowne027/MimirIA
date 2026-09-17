import crypto from 'crypto';

export function createHashSignature(data, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(data))
    .digest('hex');
}

export function verifyHashSignature(data, signature, secret) {
  const expectedSignature = createHashSignature(data, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

export function generateToken(userId) {
  const payload = {
    userId,
    timestamp: Date.now()
  };
  const signature = createHashSignature(payload, process.env.JWT_SECRET || 'default-secret');
  return {
    token: Buffer.from(JSON.stringify({ ...payload, signature })).toString('base64'),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 días
  };
}

export function verifyToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    const { signature, ...payload } = decoded;
    
    if (verifyHashSignature(payload, signature, process.env.JWT_SECRET || 'default-secret')) {
      // Verificar expiración
      const expiresAt = new Date(payload.timestamp + 30 * 24 * 60 * 60 * 1000);
      if (new Date() > expiresAt) {
        return null;
      }
      return payload;
    }
    return null;
  } catch {
    return null;
  }
}
