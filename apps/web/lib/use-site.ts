"use client";

import { useEffect, useState } from "react";

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

export interface SiteContentData {
  ticker: string[];
  hero: { eyebrow: string; lead: string };
  stats: { value: number; suffix: string; label: string }[];
  footer: { about: string; tagline: string };
}

export interface SiteContent {
  gallery: SiteGalleryItem[];
  news: SiteNewsItem[];
  content: SiteContentData | null;
  loading: boolean;
}

const portalUrl =
  process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://duga-portal.vercel.app";

export function useSiteContent(): SiteContent {
  const [state, setState] = useState<{ gallery: SiteGalleryItem[]; news: SiteNewsItem[]; content: SiteContentData | null; loading: boolean }>({
    gallery: [],
    news: [],
    content: null,
    loading: true,
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
            content: json.data?.content ?? null,
            loading: false,
          });
        }
      })
      .catch(() => {
        /* portal offline — leave empty */
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
