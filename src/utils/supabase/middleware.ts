import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import {
  ROLE_HOME_PATH,
  isAllowedUserApi,
  isPendingLikeRole,
  isPublicRoute,
  isSystemSecretApi,
  normalizeUserRole,
} from "@/types/auth";

const ACCESS_PENDING_PATH = "/access-pending";

function getPotentialPublicDocumentPrefix(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[0])) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[1])) return null;
  return parts[0];
}

function redirectTo(request: NextRequest, pathname: string) {
  return NextResponse.redirect(new URL(pathname, request.url));
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export const updateSession = async (request: NextRequest) => {
  // Create an unmodified response
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const pathname = request.nextUrl.pathname;
  const publicDocumentPrefix = getPotentialPublicDocumentPrefix(pathname);
  if (publicDocumentPrefix) {
    const { data: activePrefix } = await supabase
      .from("document_slug_prefixes")
      .select("prefix")
      .eq("prefix", publicDocumentPrefix)
      .eq("active", true)
      .maybeSingle();

    if (activePrefix) {
      return response;
    }
  }

  // This will refresh session if expired - required for Server Components
  // https://supabase.com/docs/guides/auth/server-side/nextjs
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isApiRoute = pathname.startsWith("/api");
  const isLoginPage = pathname.startsWith("/login");
  const isPublicPath = isPublicRoute(pathname);
  const isSystemSecretPath = isSystemSecretApi(pathname);

  if (!user) {
    if (isPublicPath || isSystemSecretPath) {
      return response;
    }

    if (isApiRoute) {
      return jsonError("Unauthorized", 401);
    }

    return redirectTo(request, "/login");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = normalizeUserRole(profile?.role);
  const homePath = ROLE_HOME_PATH[role];

  if (isLoginPage) {
    return redirectTo(request, homePath);
  }

  if (isSystemSecretPath || isPublicPath) {
    return response;
  }

  if (isPendingLikeRole(role)) {
    if (pathname === ACCESS_PENDING_PATH) {
      return response;
    }

    if (isApiRoute) {
      return jsonError("Forbidden", 403);
    }

    return redirectTo(request, ACCESS_PENDING_PATH);
  }

  if (role === "production") {
    if (pathname === ACCESS_PENDING_PATH) {
      return redirectTo(request, homePath);
    }

    if (isApiRoute) {
      return isAllowedUserApi(pathname, role) ? response : jsonError("Forbidden", 403);
    }

    return pathname.startsWith("/print") ? response : redirectTo(request, homePath);
  }

  if (pathname === ACCESS_PENDING_PATH) {
    return redirectTo(request, homePath);
  }

  return response;
};

