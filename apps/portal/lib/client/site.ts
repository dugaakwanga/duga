import { schoolConfig } from "@duga/core";

// Points visitors back at the marketing site. schoolConfig.siteUrl ignores
// stale localhost overrides so prod links always resolve to the live domain.
export const siteHomeUrl = schoolConfig.siteUrl;