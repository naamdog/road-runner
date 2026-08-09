import { NextResponse } from "next/server";
import { COOKIE } from "@/lib/gate";
import { getBaseUrl } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.redirect(new URL("/login", getBaseUrl()), { status: 303 });
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
