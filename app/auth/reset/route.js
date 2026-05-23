import { NextResponse } from "next/server";

function isAuthCookie(name) {
  return (
    name === "__session" ||
    name === "__client_uat" ||
    name.startsWith("__clerk") ||
    name.startsWith("__session_") ||
    name.startsWith("__client_uat_")
  );
}

export async function GET(req) {
  const response = NextResponse.redirect(new URL("/sign-in", req.url));
  response.headers.set("cache-control", "no-store");

  for (const cookie of req.cookies.getAll()) {
    if (isAuthCookie(cookie.name)) {
      response.cookies.delete(cookie.name);
    }
  }

  return response;
}
