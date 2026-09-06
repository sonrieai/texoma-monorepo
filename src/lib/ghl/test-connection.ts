import type { GhlConfig } from "@/lib/ghl/types";
import { ghlFetch } from "@/lib/ghl/http";

export type GhlConnectionTestResult = {
  ok: boolean;
  pipelineCount: number;
  locationName?: string;
  error?: string;
};

type GhlPipeline = { id: string; name?: string };

export async function testGhlConnection(
  config: GhlConfig,
): Promise<GhlConnectionTestResult> {
  try {
    const data = await ghlFetch<{ pipelines?: GhlPipeline[] }>(
      `/opportunities/pipelines?locationId=${encodeURIComponent(config.locationId)}`,
      {},
      config,
    );
    const pipelines = data.pipelines ?? [];
    const pipelineCount = pipelines.length;
    const locationName =
      pipelines.find((p) => p.name?.trim())?.name?.trim() || undefined;
    return { ok: true, pipelineCount, locationName };
  } catch (e) {
    const error =
      e instanceof Error ? e.message : "GoHighLevel connection failed";
    return { ok: false, pipelineCount: 0, error };
  }
}
