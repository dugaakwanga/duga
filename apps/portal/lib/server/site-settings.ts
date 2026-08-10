import { prisma } from "@duga/core/server";
import { WEB_PAGE_SLUGS, WEB_FEATURE_IDS, sanitizeWebPages, sanitizeWebFeatures } from "@duga/core";

export const WEBSITE_SETTING_KEY = "websiteConfig";

export interface WebsiteConfig {
  /** False hides the school's public website behind a maintenance page. */
  enabled: boolean;
  /** Message shown to visitors while the website is disabled. */
  notice: string;
  /** Public pages that are live (hidden pages 404 on the web). */
  pages: string[];
  /** Web sections/features that are switched on. */
  features: string[];
}

const DEFAULT_NOTICE =
  "This website is currently offline while the school updates it. Please check back soon, or contact the school office directly.";

export async function getWebsiteConfig(schoolId: string): Promise<WebsiteConfig> {
  const row = await prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId, key: WEBSITE_SETTING_KEY } } });
  const v = row?.value && typeof row.value === "object" ? (row.value as Partial<WebsiteConfig>) : {};
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : true,
    notice: typeof v.notice === "string" && v.notice.trim() ? v.notice : DEFAULT_NOTICE,
    pages: sanitizeWebPages(v.pages),
    features: sanitizeWebFeatures(v.features),
  };
}

export async function setWebsiteConfig(schoolId: string, cfg: Partial<WebsiteConfig>): Promise<WebsiteConfig> {
  const current = await getWebsiteConfig(schoolId);
  const next: WebsiteConfig = {
    enabled: typeof cfg.enabled === "boolean" ? cfg.enabled : current.enabled,
    notice: typeof cfg.notice === "string" ? cfg.notice : current.notice,
    pages: sanitizeWebPages(cfg.pages ?? current.pages),
    features: sanitizeWebFeatures(cfg.features ?? current.features),
  };
  await prisma.schoolSetting.upsert({
    where: { schoolId_key: { schoolId, key: WEBSITE_SETTING_KEY } },
    update: { value: next as unknown as never },
    create: { schoolId, key: WEBSITE_SETTING_KEY, value: next as unknown as never },
  });
  return next;
}
