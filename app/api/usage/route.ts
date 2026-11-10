import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { isAdminOwner, signedInOwner } from '@/lib/server/admin/admins';
import {
  readUsageRecords,
  type UsageRecord,
  type UsageKind,
  type UsageUnit,
} from '@/lib/server/usage-storage';

const log = createLogger('UsageAPI');

interface Bucket {
  key: string;
  kind: UsageKind;
  unit: UsageUnit;
  requests: number;
  // LLM token totals (0 for non-LLM).
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  // Non-token quantity (images / seconds / characters).
  quantity: number;
}

function emptyBucket(key: string, kind: UsageKind, unit: UsageUnit): Bucket {
  return {
    key,
    kind,
    unit,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 0,
    quantity: 0,
  };
}

function unitOf(r: UsageRecord): UsageUnit {
  return r.unit ?? 'token';
}

function addTo(bucket: Bucket, r: UsageRecord): void {
  bucket.requests += 1;
  bucket.inputTokens += r.inputTokens;
  bucket.outputTokens += r.outputTokens;
  bucket.cacheReadTokens += r.cacheReadTokens;
  bucket.cacheCreationTokens += r.cacheCreationTokens;
  // `inputTokens` is the provider-reported prompt token total; for
  // OpenAI-compatible providers it already includes cached input tokens. Keep
  // cache read/write counts as separate breakdown fields, but don't add them
  // again to the displayed aggregate.
  bucket.totalTokens += r.inputTokens + r.outputTokens;
  bucket.quantity += r.quantity ?? 0;
}

/** Fork: days are counted in the deployment's time zone (default Singapore). */
const USAGE_TIME_ZONE = process.env.OPENMAIC_TIMEZONE?.trim() || 'Asia/Singapore';
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: USAGE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function dayKey(createdAt: number): string {
  return dayFormat.format(new Date(createdAt)); // en-CA => YYYY-MM-DD
}

/** Epoch ms from an ISO instant or number; undefined when absent or invalid. */
function parseInstant(value: string | null): number | undefined {
  if (!value) return undefined;
  const asNumber = Number(value);
  const ms = Number.isFinite(asNumber) ? asNumber : Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * GET /api/usage
 *
 * Aggregates the deployment-wide usage log (data/usage/*.jsonl) by model, by
 * day, and by modality. Pure usage — no cost. Optional `?months=YYYY-MM,...`.
 */
export async function GET(req: NextRequest) {
  try {
    const monthsParam = req.nextUrl.searchParams.get('months');
    const months = monthsParam ? monthsParam.split(',').map((s) => s.trim()) : undefined;

    // Fork: users see only their own usage. An admin may ask for everyone's
    // (`?scope=all`), which also returns a per-user breakdown.
    const owner = signedInOwner(req.headers);
    const params = req.nextUrl.searchParams;
    const wantsAll = params.get('scope') === 'all';
    // Fork: optional period (`since`/`until`, ISO or epoch ms) and, for
    // admins, one user (`owner=nie:<id>`).
    const since = parseInstant(params.get('since'));
    const until = parseInstant(params.get('until'));
    const ownerFilter = params.get('owner')?.trim() || undefined;
    if (wantsAll && !isAdminOwner(owner)) {
      return apiError('UNAUTHORIZED', 403, 'Only administrators can see everyone’s usage');
    }
    if (!wantsAll && !owner && process.env.NIE_AUTH_API_URL) {
      return apiError('UNAUTHORIZED', 401, 'Not authenticated');
    }
    const records = await readUsageRecords({
      months,
      since,
      until,
      ownerId: wantsAll ? ownerFilter : owner,
    });

    const byUser = new Map<string, Bucket>();
    const byModel = new Map<string, Bucket>();
    const byDay = new Map<string, Bucket>();
    const byKind = new Map<UsageKind, Bucket>();
    let totalRequests = 0;
    let totalLlmTokens = 0;

    for (const r of records) {
      totalRequests += 1;
      if (r.kind === 'llm') {
        totalLlmTokens += r.inputTokens + r.outputTokens;
      }

      const mk = r.modelString || r.modelId;
      if (!byModel.has(mk)) byModel.set(mk, emptyBucket(mk, r.kind, unitOf(r)));
      addTo(byModel.get(mk)!, r);

      const dk = dayKey(r.createdAt);
      if (!byDay.has(dk)) byDay.set(dk, emptyBucket(dk, 'llm', 'token'));
      addTo(byDay.get(dk)!, r);

      if (!byKind.has(r.kind)) byKind.set(r.kind, emptyBucket(r.kind, r.kind, unitOf(r)));
      addTo(byKind.get(r.kind)!, r);

      if (wantsAll) {
        const uk = r.ownerId ?? 'unknown';
        if (!byUser.has(uk)) byUser.set(uk, emptyBucket(uk, 'llm', 'token'));
        addTo(byUser.get(uk)!, r);
      }
    }

    return apiSuccess({
      timeZone: USAGE_TIME_ZONE,
      totals: { requests: totalRequests, llmTokens: totalLlmTokens },
      byModel: [...byModel.values()].sort((a, b) => b.requests - a.requests),
      byDay: [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key)),
      byKind: [...byKind.values()],
      ...(wantsAll
        ? { byUser: [...byUser.values()].sort((a, b) => b.totalTokens - a.totalTokens) }
        : {}),
    });
  } catch (error) {
    log.error('Usage aggregation failed:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Failed to read usage',
    );
  }
}
