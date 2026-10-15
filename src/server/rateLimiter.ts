import { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  code?: string;
}

interface ClientRecord {
  timestamps: number[];
}

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, message = 'Too many requests. Please try again later.', code = 'RATE_LIMIT_EXCEEDED' } = options;
  const clients = new Map<string, ClientRecord>();

  // Cleanup old records periodically to prevent memory leaks
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of clients.entries()) {
      record.timestamps = record.timestamps.filter(t => now - t < windowMs);
      if (record.timestamps.length === 0) {
        clients.delete(ip);
      }
    }
  }, Math.max(windowMs, 30000));
  
  // Ensure interval does not prevent Node process from exiting
  if (interval.unref) {
    interval.unref();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    // In dev / test or when x-forwarded-for is present
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || '127.0.0.1';

    const now = Date.now();
    let record = clients.get(ip);
    if (!record) {
      record = { timestamps: [] };
      clients.set(ip, record);
    }

    // Filter out timestamps outside current window
    record.timestamps = record.timestamps.filter(t => now - t < windowMs);

    if (record.timestamps.length >= max) {
      const oldest = record.timestamps[0];
      const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil((oldest + windowMs) / 1000));

      return res.status(429).json({
        ok: false,
        error: message,
        code,
        retryAfterSeconds
      });
    }

    record.timestamps.push(now);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.timestamps.length));

    next();
  };
}

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 min per IP
  message: 'Too many authentication attempts. Please try again after 15 minutes to protect your account.',
  code: 'AUTH_RATE_LIMIT'
});

export const aiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: 'AI analysis request limit reached. Please wait a minute before analyzing more images.',
  code: 'AI_RATE_LIMIT'
});

export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute
  message: 'API request limit exceeded. Please throttle your requests.',
  code: 'API_RATE_LIMIT'
});
