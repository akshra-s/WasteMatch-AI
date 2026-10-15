import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import { db, UserRecord } from '../db/database';

const JWT_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'wastematch-dev-secret-change-in-production-min32chars';
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface AuthenticatedRequest extends Request {
  user?: UserRecord;
}

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const computed = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    const hashBuf = Buffer.from(hash, 'hex');
    const computedBuf = Buffer.from(computed, 'hex');
    if (hashBuf.length !== computedBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, computedBuf);
  } catch {
    return false;
  }
}

export function createToken(user: UserRecord): string {
  const payload = {
    userId: user.id,
    email: user.email,
    companyName: user.companyName,
    role: user.role,
    exp: Date.now() + TOKEN_EXPIRY_MS
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(payloadStr).digest('base64url');
  return `${payloadStr}.${signature}`;
}

export function verifyToken(token: string): { userId: string; email: string; companyName: string; role: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadStr, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(payloadStr).digest('base64url');
    
    // Constant time compare
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf-8'));
    if (!payload.exp || Date.now() > payload.exp) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || req.headers['x-auth-token'];
  let token = '';

  if (typeof authHeader === 'string') {
    token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  }

  if (!token) {
    return res.status(401).json({
      ok: false,
      error: 'Authentication required. Missing Bearer token.',
      code: 'UNAUTHORIZED'
    });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({
      ok: false,
      error: 'Invalid or expired session token.',
      code: 'TOKEN_INVALID'
    });
  }

  const user = await db.findUserById(decoded.userId);
  if (!user) {
    return res.status(401).json({
      ok: false,
      error: 'User account not found or removed.',
      code: 'USER_NOT_FOUND'
    });
  }

  req.user = user;
  next();
}

export async function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || req.headers['x-auth-token'];
  if (typeof authHeader === 'string') {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    const decoded = verifyToken(token);
    if (decoded) {
      const user = await db.findUserById(decoded.userId);
      if (user) {
        req.user = user;
      }
    }
  }
  next();
}

export const authRouter = express.Router();

/** POST /api/auth/register */
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, companyName, location, role } = req.body || {};

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ ok: false, error: 'A valid email address is required.', code: 'INVALID_EMAIL' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters long.', code: 'INVALID_PASSWORD' });
    }
    if (!companyName || typeof companyName !== 'string' || companyName.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Company or organization name is required.', code: 'INVALID_COMPANY' });
    }

    const existing = await db.findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ ok: false, error: 'An account with this email already exists.', code: 'USER_EXISTS' });
    }

    const { hash, salt } = hashPassword(password);
    const user = await db.createUser({
      email,
      passwordHash: hash,
      salt,
      companyName,
      location: location || 'Pune, Maharashtra',
      role: role === 'buyer' ? 'buyer' : 'seller'
    });

    const token = createToken(user);

    return res.status(201).json({
      ok: true,
      message: 'Registration successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        companyName: user.companyName,
        location: user.location,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (err: any) {
    console.error('[POST /api/auth/register] error:', err);
    return res.status(500).json({ ok: false, error: 'Internal registration error', code: 'SERVER_ERROR' });
  }
});

/** POST /api/auth/login */
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password are required.', code: 'MISSING_CREDENTIALS' });
    }

    const user = await db.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
    }

    const valid = verifyPassword(password, user.passwordHash, user.salt);
    if (!valid) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
    }

    const token = createToken(user);

    return res.json({
      ok: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        companyName: user.companyName,
        location: user.location,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (err: any) {
    console.error('[POST /api/auth/login] error:', err);
    return res.status(500).json({ ok: false, error: 'Internal login error', code: 'SERVER_ERROR' });
  }
});

/** GET /api/auth/me */
authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  return res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      companyName: user.companyName,
      location: user.location,
      role: user.role,
      createdAt: user.createdAt
    }
  });
});

/** POST /api/auth/logout */
authRouter.post('/logout', (_req: Request, res: Response) => {
  return res.json({
    ok: true,
    message: 'Logged out successfully'
  });
});
