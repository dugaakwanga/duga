"use client";

import { useEffect, useState } from "react";
import { portalUrl } from "@/lib/content";
import { mergeContent, type SiteContentData, type SiteSchoolInfo } from "@/lib/site-data";

export interface SiteGalleryItem {
  id: string;
  title: string;
  category: string;
  url: string;
  alt: string | null;
  createdAt: string;
}

export interface SiteNewsItem {
  id: string;
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  body: string[];
  coverUrl: string | null;
  publishedAt: string;
}

export interface SitePtaExecutive {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
}

export interface SitePtaMeeting {
  id: string;
  title: string;
  date: string;
  venue: string | null;
  agenda: string | null;
}

export interface SiteContent {
  gallery: SiteGalleryItem[];
  news: SiteNewsItem[];
  school: SiteSchoolInfo | null;
  content: SiteContentData;
  loading: boolean;
  pta: { executives: SitePtaExecutive[]; meetings: SitePtaMeeting[] };
}

export function useSiteContent(): SiteContent {
  const [state, setState] = useState<SiteContent>({
    gallery: [],
    news: [],
    school: null,
    content: mergeContent(null),
    loading: true,
    pta: { executives: [], meetings: [] },
  });

  useEffect(() => {
    let alive = true;
    const absolute = (u?: string | null) => {
      if (!u) return "";
      return /^https?:\/\//.test(u) ? u : `${portalUrl}${u}`;
    };
    fetch(`${portalUrl}/api/public/site`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (alive && json.ok) {
          setState({
            gallery: Array.isArray(json.data?.gallery)
              ? json.data.gallery.map((g: SiteGalleryItem) => ({ ...g, url: absolute(g.url) }))
              : [],
            news: Array.isArray(json.data?.news)
              ? json.data.news.map((n: SiteNewsItem) => ({ ...n, coverUrl: absolute(n.coverUrl) }))
              : [],
            school: json.data?.school ?? null,
            content: mergeContent(json.data?.content),
            loading: false,
            pta: {
              executives: Array.isArray(json.data?.pta?.executives)
                ? json.data.pta.executives.map((e: SitePtaExecutive) => ({ ...e, photoUrl: absolute(e.photoUrl) }))
                : [],
              meetings: Array.isArray(json.data?.pta?.meetings)
                ? json.data.pta.meetings.map((m: SitePtaMeeting) => ({ ...m, venue: m.venue }))
                : [],
            },
          });
        }
      })
      .catch(() => {
        /* portal offline — leave defaults */
      })
      .finally(() => {
        if (alive) setState((s) => ({ ...s, loading: false }));
      });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
