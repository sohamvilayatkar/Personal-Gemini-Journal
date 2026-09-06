import express, { type Application } from 'express';
import { configureSecurityHeaders } from './middleware/securityHeaders';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import healthRoutes from './routes/healthRoutes';
import authRoutes from './routes/authRoutes';
import geminiRoutes from './routes/geminiRoutes';
import conversationRoutes from './routes/conversationRoutes';
import journalRoutes from './routes/journalRoutes';
import memoryRoutes from './routes/memoryRoutes';
import insightRoutes from './routes/insightRoutes';

export function createExpressApp(): Application {
  const app = express();

  // 1. Security Headers, CORS, and Payload Limiting
  app.use(configureSecurityHeaders());

  // 2. Redacted Request Logging
  app.use(requestLogger);

  // 3. API Routes
  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/chat', geminiRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/journals', journalRoutes);
  app.use('/api/memories', memoryRoutes);
  app.use('/api/insights', insightRoutes);

  // 4. Dedicated 404 handler for /api/* to guarantee API routes never return index.html
  app.all('/api/*', (_req, res) => {
    res.status(404).json({
      error: 'API route not found',
      code: 'NOT_FOUND',
    });
  });

  // 5. Centralized Error Handler
  app.use(errorHandler);

  return app;
}
