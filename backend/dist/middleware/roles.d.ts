import { Request, Response, NextFunction } from 'express';
export declare function requireRole(roles: string[]): (req: Request, res: Response, next: NextFunction) => void;
export declare function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=roles.d.ts.map