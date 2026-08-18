import { NextResponse } from "next/server";
import { buildOpenApiSpec } from "@/lib/openapi/spec";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const spec = buildOpenApiSpec(baseUrl);

  return NextResponse.json(spec, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
