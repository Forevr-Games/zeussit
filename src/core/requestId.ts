import type { RequestHandler } from 'express';
import { randomBytes } from 'node:crypto';

declare module 'express-serve-static-core' {
  interface Request {
    zeussitRequestId?: string;
  }
}

export const requestIdMiddleware: RequestHandler = (req, _res, next) => {
  req.zeussitRequestId = randomBytes(6).toString('hex');
  next();
};
