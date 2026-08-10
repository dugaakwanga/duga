import { notFound } from "next/navigation";
import { WEB_PAGE_SLUGS } from "@duga/core";
import { getSiteData } from "./site-data";

/**
 * Server-side gate for public pages. Fetches the school's website config and
 * renders a 404 when the superadmin has disabled this page for the school.
 * Call at the top of every public page component.
 */
export async function assertSitePage(slug: string): Promise<void> {
  try {
    const { website } = await getSiteData();
    const enabled = new Set(website.pages.length ? website.pages : WEB_PAGE_SLUGS);
    if (!enabled.has(slug)) notFound();
  } catch {
    // Portal unreachable — stay permissive rather than bricking the site.
    return;
  }
}