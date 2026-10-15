import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { aiRouter } from './src/server/aiRoutes';
import { authRouter } from './src/server/auth';
import { listingRouter } from './src/server/listingRoutes';
import { n8nRouter } from './src/server/n8nService';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Security & protection headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Images arrive as base64 -> allow JSON bodies up to 20mb
  app.use(express.json({ limit: '20mb' }));

  // API Health probe
  app.get('/api/health', (_req, res) => {
    const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    const hasN8n = Boolean(process.env.N8N_WEBHOOK_URL);

    res.json({
      ok: true,
      service: 'WasteMatch-AI',
      timestamp: new Date().toISOString(),
      status: 'healthy',
      features: {
        database: 'operational',
        geminiVision: hasGeminiKey ? 'configured' : 'missing_api_key',
        n8nAutomation: hasN8n ? 'configured' : 'missing_webhook_url',
        geocoding: 'OpenStreetMap Nominatim Live'
      }
    });
  });

  // Mount API routers
  app.use('/api/auth', authRouter);
  app.use('/api/listings', listingRouter);
  app.use('/api/automation', n8nRouter);
  app.use('/api', aiRouter);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global error handler (prevents leaking internal stack traces)
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Server Unhandled Error]:', err);
    res.status(err.status || 500).json({
      ok: false,
      error: 'An internal server error occurred.',
      code: 'INTERNAL_SERVER_ERROR'
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WasteMatch AI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
