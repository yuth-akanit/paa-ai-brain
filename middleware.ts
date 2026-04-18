import { NextRequest, NextResponse } from "next/server";

const protectedPrefixes = ["/admin", "/api/admin"];

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
}

export function middleware(request: NextRequest) {
  if (!isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Bypass basic auth for cron endpoints that use x-cron-secret header instead
  const cronSecret = process.env.CRON_SECRET;
  const cronEndpoints = ["/api/admin/auto-release-stale", "/api/admin/follow-up"];
  if (cronSecret && cronEndpoints.includes(request.nextUrl.pathname)) {
    const provided = request.headers.get("x-cron-secret");
    if (provided === cronSecret) {
      return NextResponse.next();
    }
  }

  const username = process.env.ADMIN_BASIC_AUTH_USER;
  const password = process.env.ADMIN_BASIC_AUTH_PASS;

  // Fail-closed: if credentials are not configured, deny access (never allow through)
  if (!username || !password) {
    console.error("[middleware] ADMIN_BASIC_AUTH_USER/PASS not configured - denying admin access");
    return new NextResponse("Server configuration error: admin auth not configured", {
      status: 503
    });
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Basic ")) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="PAA Admin"'
      }
    });
  }

  const credentials = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
  const [providedUser, providedPass] = credentials.split(":");

  if (providedUser !== username || providedPass !== password) {
    return new NextResponse("Invalid credentials", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="PAA Admin"'
      }
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
