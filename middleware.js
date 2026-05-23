import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/auth/reset(.*)"]);

function isLocalDevRequest(req) {
  return (
    process.env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1", "::1"].includes(req.nextUrl.hostname)
  );
}

export default clerkMiddleware(async (auth, req) => {
  if (isLocalDevRequest(req)) {
    if (req.nextUrl.pathname.startsWith("/sign-in")) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
