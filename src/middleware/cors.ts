/**
 * Middleware CORS permissivo para desenvolvimento, aceitando qualquer origem
 * e liberando métodos/headers comuns usados pelo frontend.
 */
import type { Request, Response, NextFunction } from 'express';

export function permissiveCors(req: Request, res: Response, next: NextFunction) {
  const origin = (req.headers.origin as string) || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}
