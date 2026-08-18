import { NextResponse } from "next/server";
import { healthCheck } from "@/lib/nexhealth/client";

export async function GET() {
  try {
    const result = await healthCheck();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        message: e instanceof Error ? e.message : "Health check failed",
      },
      { status: 503 },
    );
  }
}
