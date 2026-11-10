import { AsyncLocalStorage } from 'node:async_hooks';
import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '@/lib/logger';
import { adminQuery, isAdminDatabaseConfigured } from '@/lib/server/admin/db';
import { AUTHENTICATED_OWNER_HEADER } from '@/lib/server/agent-runtime/owner-header';
import { hasBillableTokens, type NormalizedUsage } from '@/lib/usage/normalize';

const log = createLogger('UsageStorage');

/** Base directory for usage logs; lands in the openmaic-data volume in Docker. */
function usageDir(baseDir?: string): string {
  return baseDir ?? path.join(process.cwd(), 'data', 'usage');
}

/** Current month's jsonl file name, e.g. usage/2026-06.jsonl. */
function monthlyFile(dir: string, now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return path.join(dir, `${y}-${m}.jsonl`);
}

/** What kind of generation produced this usage. */
export type UsageKind = 'llm' | 'image' | 'video' | 'tts' | 'asr';
/** Unit of the non-token quantity. */
export type UsageUnit = 'token' | 'image' | 'second' | 'character';

/** Input to record one generation's usage. */
export interface UsageRecordInput {
  /** Modality. Defaults to 'llm'. */
  kind?: UsageKind;
  source: string;
  providerId: string;
  modelId: string;
  modelString: string;
  /** Token usage (LLM only). */
  usage?: NormalizedUsage;
  /** Non-token quantity: images count / seconds / characters. */
  quantity?: number;
  /** Unit for `quantity`. */
  unit?: UsageUnit;
  /** Fork: who made the request; resolved automatically when omitted. */
  ownerId?: string;
}

/** A persisted usage row — pure usage, no cost. */
export interface UsageRecord {
  id: string;
  createdAt: number;
  /** Fork: signed-in owner (`nie:<userId>`); absent on legacy/anonymous rows. */
  ownerId?: string;
  kind: UsageKind;
  source: string;
  providerId: string;
  modelId: string;
  modelString: string;
  // LLM token counts (0 for non-LLM rows).
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
  // Non-token usage (e.g. image count, video seconds, TTS characters).
  quantity?: number;
  unit?: UsageUnit;
}

interface RecordOptions {
  baseDir?: string;
  /** Injected clock for deterministic tests. */
  now?: Date;
}

let counter = 0;
function makeId(now: Date): string {
  counter = (counter + 1) % 1_000_000;
  return `${now.getTime()}-${counter.toString(36)}`;
}

const ZERO_USAGE: NormalizedUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  reasoningTokens: 0,
};

/**
 * Fork: who to attribute usage to when there is no web request (the Pro
 * workspace agent runner). The runner wraps each session in this.
 */
const usageOwnerContext = new AsyncLocalStorage<string>();

export function runWithUsageOwner<T>(ownerId: string, fn: () => T): T {
  return usageOwnerContext.run(ownerId, fn);
}

/** Explicit owner > runner context > the signed-in user of the current request. */
async function resolveUsageOwner(explicit?: string): Promise<string | undefined> {
  if (explicit) return explicit;
  const fromRunner = usageOwnerContext.getStore();
  if (fromRunner) return fromRunner;
  try {
    const { headers } = await import('next/headers');
    const owner = (await headers()).get(AUTHENTICATED_OWNER_HEADER)?.trim();
    return owner || undefined;
  } catch {
    return undefined; // outside a request scope
  }
}

async function insertUsageRow(record: UsageRecord): Promise<void> {
  await adminQuery(
    `INSERT INTO openmaic_usage (id, created_at, owner_id, kind, source, provider_id, model_id,
       model_string, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
       reasoning_tokens, quantity, unit)
     VALUES ($1, to_timestamp($2 / 1000.0), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (id) DO NOTHING`,
    [
      record.id,
      record.createdAt,
      record.ownerId ?? null,
      record.kind,
      record.source,
      record.providerId,
      record.modelId,
      record.modelString,
      record.inputTokens,
      record.outputTokens,
      record.cacheReadTokens,
      record.cacheCreationTokens,
      record.reasoningTokens,
      record.quantity ?? null,
      record.unit ?? null,
    ],
  );
  // Fork: "last active" for the admin Users page = the latest AI request.
  if (record.ownerId) {
    await adminQuery(
      `UPDATE openmaic_users SET last_active_at = to_timestamp($2 / 1000.0)
        WHERE owner_id = $1 AND (last_active_at IS NULL OR last_active_at < to_timestamp($2 / 1000.0))`,
      [record.ownerId, record.createdAt],
    );
  }
}

/**
 * Records one generation's usage as a jsonl line. Fire-and-forget: never throws —
 * a logging failure must not break generation.
 *
 * - LLM rows: require billable tokens (skips empty usage, e.g. a streamed
 *   OpenAI-compatible response that omitted usage).
 * - Non-LLM rows (image/video/tts/asr): require quantity > 0.
 */
export async function recordUsage(
  input: UsageRecordInput,
  opts: RecordOptions = {},
): Promise<void> {
  // A test run must never append to the app's real usage log. Any test that
  // exercises callLLM / streamLLM reaches this through `recordUsageSafe` without
  // asking for it, and used to write rows into the live `data/usage/` file —
  // `minimax-auth-test`, `serialization-test` and friends were sitting in there
  // next to production traffic, corrupting any real usage analysis. Tests that
  // mean to exercise storage pass an explicit `baseDir` (or mock this module),
  // so both of those keep working.
  if (!opts.baseDir && (process.env.VITEST || process.env.NODE_ENV === 'test')) return;

  try {
    const kind: UsageKind = input.kind ?? 'llm';
    const usage = input.usage ?? ZERO_USAGE;

    if (kind === 'llm') {
      if (!hasBillableTokens(usage)) return;
    } else if (!input.quantity || input.quantity <= 0) {
      return;
    }

    const now = opts.now ?? new Date();
    const ownerId = await resolveUsageOwner(input.ownerId);
    const record: UsageRecord = {
      id: makeId(now),
      createdAt: now.getTime(),
      ...(ownerId ? { ownerId } : {}),
      kind,
      source: input.source,
      providerId: input.providerId,
      modelId: input.modelId,
      modelString: input.modelString,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheCreationTokens: usage.cacheCreationTokens,
      reasoningTokens: usage.reasoningTokens,
      ...(input.quantity != null ? { quantity: input.quantity } : {}),
      ...(input.unit ? { unit: input.unit } : {}),
    };

    // Fork: Postgres when available (container files vanish on redeploy).
    if (!opts.baseDir && isAdminDatabaseConfigured()) {
      await insertUsageRow(record);
      return;
    }
    const dir = usageDir(opts.baseDir);
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(monthlyFile(dir, now), JSON.stringify(record) + '\n', 'utf-8');
  } catch (err) {
    log.warn('Failed to record usage (ignored):', err);
  }
}

/** A non-LLM modality usage event (image / video / tts / asr). */
export interface GenerationUsageInput {
  kind: Exclude<UsageKind, 'llm'>;
  unit: UsageUnit;
  providerId: string;
  /** The client-requested model id; falls back to providerId when absent. */
  modelId?: string;
  quantity: number;
}

/**
 * Records a non-LLM generation's usage. Thin wrapper over {@link recordUsage}
 * that derives `source` (= kind) and `modelString` (`provider:model`) from the
 * modality, so the generate routes don't each repeat that construction.
 * Fire-and-forget like `recordUsage`.
 */
export function recordGenerationUsage(input: GenerationUsageInput): Promise<void> {
  const modelId = input.modelId || input.providerId;
  return recordUsage({
    kind: input.kind,
    unit: input.unit,
    source: input.kind,
    providerId: input.providerId,
    modelId,
    modelString: `${input.providerId}:${modelId}`,
    quantity: input.quantity,
  });
}

interface ReadOptions {
  baseDir?: string;
  /** Limit to specific YYYY-MM month files; defaults to all files in the dir. */
  months?: string[];
  /** Fork: only this owner's rows (undefined = everyone). */
  ownerId?: string;
  /** Fork: only rows at or after this instant (epoch ms). */
  since?: number;
  /** Fork: only rows before this instant (epoch ms). */
  until?: number;
}

interface UsageRow extends Record<string, unknown> {
  id: string;
  created_ms: string | number;
  owner_id: string | null;
  kind: UsageKind;
  source: string;
  provider_id: string;
  model_id: string;
  model_string: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  reasoning_tokens: number;
  quantity: number | null;
  unit: UsageUnit | null;
}

async function readUsageRows(opts: ReadOptions): Promise<UsageRecord[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  if (opts.ownerId) {
    values.push(opts.ownerId);
    where.push(`owner_id = $${values.length}`);
  }
  if (opts.months?.length) {
    values.push(opts.months);
    where.push(`to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') = ANY($${values.length})`);
  }
  if (opts.since != null) {
    values.push(opts.since);
    where.push(`created_at >= to_timestamp($${values.length} / 1000.0)`);
  }
  if (opts.until != null) {
    values.push(opts.until);
    where.push(`created_at < to_timestamp($${values.length} / 1000.0)`);
  }
  const rows = await adminQuery<UsageRow>(
    `SELECT id, (extract(epoch FROM created_at) * 1000) AS created_ms, owner_id, kind, source,
            provider_id, model_id, model_string, input_tokens, output_tokens, cache_read_tokens,
            cache_creation_tokens, reasoning_tokens, quantity, unit
       FROM openmaic_usage ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at`,
    values,
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: Number(r.created_ms),
    ...(r.owner_id ? { ownerId: r.owner_id } : {}),
    kind: r.kind,
    source: r.source,
    providerId: r.provider_id,
    modelId: r.model_id,
    modelString: r.model_string,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    cacheReadTokens: r.cache_read_tokens,
    cacheCreationTokens: r.cache_creation_tokens,
    reasoningTokens: r.reasoning_tokens,
    ...(r.quantity != null ? { quantity: r.quantity } : {}),
    ...(r.unit ? { unit: r.unit } : {}),
  }));
}

/**
 * Reads all usage records (across monthly files). Returns [] when the dir is
 * absent. Malformed lines are skipped. Legacy rows without `kind` are treated as
 * 'llm'; any legacy cost fields are simply ignored.
 */
export async function readUsageRecords(opts: ReadOptions = {}): Promise<UsageRecord[]> {
  if (!opts.baseDir && isAdminDatabaseConfigured()) return readUsageRows(opts);
  const dir = usageDir(opts.baseDir);
  let files: string[];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return [];
  }
  if (opts.months?.length) {
    files = files.filter((f) => opts.months!.some((m) => f.startsWith(m)));
  }

  const records: UsageRecord[] = [];
  for (const file of files.sort()) {
    let content: string;
    try {
      content = await fs.readFile(path.join(dir, file), 'utf-8');
    } catch {
      continue;
    }
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as UsageRecord;
        if (!row.kind) row.kind = 'llm'; // backward-compat
        if (opts.ownerId && row.ownerId !== opts.ownerId) continue;
        if (opts.since != null && row.createdAt < opts.since) continue;
        if (opts.until != null && row.createdAt >= opts.until) continue;
        records.push(row);
      } catch {
        // skip malformed line
      }
    }
  }
  return records;
}
