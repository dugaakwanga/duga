import { NextRequest, NextResponse } from "next/server";

// The admin portal lives on its own subdomain (e.g. admin.deultimateglory.com).
// When a request arrives on that subdomain, rewrite the public entry routes
// (/ and /login) to the admin console routes. Everything else (/portal, /api,
// /superadmin) is untouched so both subdomains can serve the same app.
//
// The admin console stays directly reachable (e.g. /admin on localhost) so it
// can be accessed and tested even without a configured subdomain.
const ADMIN_SUBDOMAIN = (process.env.ADMIN_SUBDOMAIN || "admin").toLowerCase();

function isAdminDomainHost(host: string): boolean {
  const h = host.split(":");
  const hostname = (h[0] || "").toLowerCase();
  if (!hostname) return false;
  return hostname === ADMIN_SUBDOMAIN || hostname.endsWith(`.${ADMIN_SUBDOMAIN}`);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";
  const isAdminHost = isAdminDomainHost(host);
  const forceAdmin = request.nextUrl.searchParams.get("portal") === "admin";

  // On the admin subdomain, route the public entry points to the admin console.
  if (isAdminHost || forceAdmin) {
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.rewrite(url);
    }
    if (pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/admin", "/admin/login"],
};
