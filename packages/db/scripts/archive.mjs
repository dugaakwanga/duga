// Data lifecycle job — keeps the free-tier database small over years of use
// by moving old, rarely-needed rows out of the hot tables into a compressed
// export in object storage, then deleting them from Postgres. Nothing is
// actually lost — it's moved, not destroyed.
//
// Run: node scripts/archive.mjs   (from packages/db)
// Intended to run on a schedule (see .github/workflows/archive.yml).
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { gzipSync } from "zlib";

const prisma = new PrismaClient();

const AUDIT_LOG_RETENTION_DAYS = Number(process.env.AUDIT_LOG_RETENTION_DAYS || 730);
const NOTIFICATION_RETENTION_DAYS = Number(process.env.NOTIFICATION_RETENTION_DAYS || 180);
// Cap per run so a single invocation stays fast and light on the connection
// pool; a backlog is cleared over a few scheduled runs rather than one huge
// transaction.
const BATCH_SIZE = 5000;

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function r2Configured() {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET && process.env.R2_PUBLIC_URL);
}

function r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function uploadArchive(name, rows) {
  if (!rows.length) return;
  const body = gzipSync(Buffer.from(JSON.stringify(rows)));
  const key = `archive/${name}/${new Date().toISOString().slice(0, 10)}-${Date.now()}.json.gz`;
  if (r2Configured()) {
    await r2Client().send(
      new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: body, ContentType: "application/gzip" }),
    );
    console.log(`  archived ${rows.length} rows -> r2://${process.env.R2_BUCKET}/${key}`);
  } else {
    // No object storage configured yet: skip archiving for this run rather
    // than deleting rows with nowhere to put them.
    console.log(`  R2 not configured — skipping archive of ${rows.length} ${name} rows (nothing deleted)`);
    return false;
  }
  return true;
}

async function archiveAuditLogs() {
  const cutoff = daysAgo(AUDIT_LOG_RETENTION_DAYS);
  const rows = await prisma.auditLog.findMany({ where: { createdAt: { lt: cutoff } }, take: BATCH_SIZE });
  console.log(`AuditLog: ${rows.length} rows older than ${AUDIT_LOG_RETENTION_DAYS} days`);
  const uploaded = await uploadArchive("auditlog", rows);
  if (uploaded && rows.length) {
    await prisma.auditLog.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    console.log(`  deleted ${rows.length} AuditLog rows from the live database`);
  }
}

async function archiveNotifications() {
  const cutoff = daysAgo(NOTIFICATION_RETENTION_DAYS);
  const rows = await prisma.notification.findMany({ where: { isRead: true, createdAt: { lt: cutoff } }, take: BATCH_SIZE });
  console.log(`Notification: ${rows.length} read rows older than ${NOTIFICATION_RETENTION_DAYS} days`);
  const uploaded = await uploadArchive("notification", rows);
  if (uploaded && rows.length) {
    await prisma.notification.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    console.log(`  deleted ${rows.length} Notification rows from the live database`);
  }
}

async function main() {
  console.log("Running data archival job...");
  await archiveAuditLogs();
  await archiveNotifications();
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
