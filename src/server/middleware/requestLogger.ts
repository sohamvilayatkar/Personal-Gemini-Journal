import type { Request, Response, NextFunction } from 'express';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Do not log static asset requests
  if (
    req.path.startsWith('/assets') ||
    req.path.startsWith('/@') ||
    req.path.startsWith('/src') ||
    req.path.endsWith('.js') ||
    req.path.endsWith('.css') ||
    req.path.endsWith('.svg') ||
    req.path.endsWith('.ico')
  ) {
    return next();
  }

  const start = Date.now();
  const safePath = req.path;
  const method = req.method;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    // Log only method, safe path, status code, and duration
    // Strictly omit Authorization header and sensitive request payloads
    const authStatus = req.headers.authorization ? 'Bearer [PRESENT]' : 'NONE';
    console.log(
      `[${new Date().toISOString()}] ${method} ${safePath} ${statusCode} - ${duration}ms (Auth: ${authStatus})`
    );
  });

  next();
};
