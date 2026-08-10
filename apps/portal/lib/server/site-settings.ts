import { prisma } from "@duga/core/server";

export const WEBSITE_SETTING_KEY = "websiteConfig";

export interface WebsiteConfig {
  /** False hides the school's public website behind a maintenance page. */
  enabled: boolean;
  /** Message shown to visitors while the website is disabled. */
  notice: string;
}

const DEFAULT_NOTICE =
  "This website is currently offline while the school updates it. Please check back soon, or contact the school office directly.";

export async function getWebsiteConfig(schoolId: string): Promise<WebsiteConfig> {
  const row = await prisma.schoolSetting.findUnique({ where: { schoolId_key: { schoolId, key: WEBSITE_SETTING_KEY } } });
  const v = row?.value && typeof row.value === "object" ? (row.value as Partial<WebsiteConfig>) : {};
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : true,
    notice: typeof v.notice === "string" && v.notice.trim() ? v.notice : DEFAULT_NOTICE,
  };
}

export async function setWebsiteConfig(schoolId: string, cfg: WebsiteConfig): Promise<WebsiteConfig> {
  await prisma.schoolSetting.upsert({
    where: { schoolId_key: { schoolId, key: WEBSITE_SETTING_KEY } },
    update: { value: cfg as unknown as never },
    create: { schoolId, key: WEBSITE_SETTING_KEY, value: cfg as unknown as never },
  });
  return cfg;
}
