import type { Request, Response, NextFunction, RequestHandler } from "express";

// Обгортка async-контролерів: ловить reject і пробрасує у централізований error-handler (§9.2).
// Без неї відхилений промис у Express 4 не долетів би до error-middleware.
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
