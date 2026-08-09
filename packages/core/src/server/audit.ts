import { prisma } from "./prisma";

export interface AuditInput {
  schoolId?: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

// Every sensitive action (grade changes, payment overrides, account creation,
// fee changes, result publication) flows through here for an immutable trail.
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        schoolId: input.schoolId,
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        meta: input.meta ? JSON.parse(JSON.stringify(input.meta)) : undefined,
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });
  } catch (e) {
    console.error("audit log write failed:", e);
  }
}

export async function systemLog(level: string, source: string, message: string, meta?: Record<string, unknown>, schoolId?: string) {
  try {
    await prisma.systemLog.create({
      data: {
        level,
        source,
        message,
        schoolId,
        meta: meta ? JSON.parse(JSON.stringify(meta)) : undefined,
      },
    });
  } catch {
    // never crash on logging
  }
}
