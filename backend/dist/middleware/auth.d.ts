import { Request, Response, NextFunction } from 'express';
export interface JwtPayload {
    userId: string;
    tenantId: string;
    role: string;
    isSuperAdmin: boolean;
}
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}
export declare function authMiddleware(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map