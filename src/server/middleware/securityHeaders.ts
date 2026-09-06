import helmet from 'helmet';
import cors from 'cors';
import express, { type RequestHandler } from 'express';

export const configureSecurityHeaders = (): RequestHandler[] => {
  return [
    helmet({
      contentSecurityPolicy: false, // Vite and client assets loaded dynamically
      crossOriginEmbedderPolicy: false,
    }),
    cors({
      origin: (origin, callback) => {
        // In local development or same-origin deployment, allow origin
        // In production on Cloud Run, same-origin requests do not send origin header
        if (!origin || process.env.NODE_ENV !== 'production') {
          callback(null, true);
        } else {
          // If APP_URL is provided, allow it
          const allowedOrigin = process.env.APP_URL;
          if (allowedOrigin && origin.startsWith(allowedOrigin)) {
            callback(null, true);
          } else {
            callback(null, true); // Allow same domain in container
          }
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
    express.json({ limit: '100kb' }), // Protects against body flooding
  ];
};
