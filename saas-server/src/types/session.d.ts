import 'express-session';

declare module 'express-session' {
  interface SessionData {
    adminId?: string;
    tenantId?: string;
    type?: 'tenant_admin' | 'super_admin';
    superAdminId?: string;
    totpVerified?: boolean;
    impersonatingTenantId?: string;
  }
}
