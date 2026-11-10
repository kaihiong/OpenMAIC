'use client';

/**
 * Fork: admin dashboard. Users, courses (view only) and AI usage across
 * everyone, with a period selector, a per-user drill-down, a daily chart and
 * CSV export.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Download,
  ExternalLink,
  RefreshCw,
  Users,
  X,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface AdminUser {
  ownerId: string;
  userId: string;
  name: string;
  email: string;
  department: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastActiveAt: string | null;
  loginCount: number;
  courseCount: number;
  requests: number;
  llmTokens: number;
}

interface AdminCourse {
  id: string;
  name: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  sceneCount: number;
  generationComplete: boolean;
}

interface UsageBucket {
  key: string;
  kind: string;
  unit: string;
  requests: number;
  totalTokens: number;
  quantity: number;
}

interface UsageReport {
  timeZone?: string;
  totals: { requests: number; llmTokens: number };
  byModel: UsageBucket[];
  byDay: UsageBucket[];
  byKind: UsageBucket[];
  byUser?: UsageBucket[];
}

type Period = '7d' | '30d' | 'month' | 'all';

const PERIODS: { id: Period; label: string }[] = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

const number = new Intl.NumberFormat('en-SG');
const compact = new Intl.NumberFormat('en-SG', { notation: 'compact', maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat('en-SG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Singapore',
});
const shortDay = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function formatDate(value: string | number | null | undefined): string {
  if (value == null) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateTime.format(date);
}

function shortOwner(ownerId: string): string {
  return ownerId.replace(/^nie:/, '');
}

/** "openai:gpt-6-luna" -> model "gpt-6-luna". The provider prefix is not shown:
 *  on this deployment every model is served by Azure OpenAI. */
function modelName(modelString: string): string {
  const i = modelString.indexOf(':');
  return i >= 0 ? modelString.slice(i + 1) : modelString;
}

const KIND_LABELS: Record<string, string> = {
  llm: 'Text (LLM)',
  image: 'Images',
  video: 'Video',
  tts: 'Narration',
  asr: 'Transcription',
};

const KIND_UNITS: Record<string, string> = {
  llm: 'tokens',
  image: 'images',
  video: 'seconds',
  tts: 'characters',
  asr: 'seconds',
};

function amountOf(b: UsageBucket): number {
  return b.kind === 'llm' ? b.totalTokens : b.quantity;
}

/** Start of the period as an ISO instant, or undefined for all time. */
function periodSince(period: Period): string | undefined {
  const now = Date.now();
  if (period === '7d') return new Date(now - 7 * DAY_MS).toISOString();
  if (period === '30d') return new Date(now - 30 * DAY_MS).toISOString();
  if (period === 'month') {
    // First day of the current month in Singapore (UTC+8, no DST).
    const sg = new Date(now + 8 * 60 * 60 * 1000);
    return new Date(
      Date.UTC(sg.getUTCFullYear(), sg.getUTCMonth(), 1) - 8 * 60 * 60 * 1000,
    ).toISOString();
  }
  return undefined;
}

/** Today's date (YYYY-MM-DD) in Singapore. */
function singaporeToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

interface Range {
  period: Period;
  since?: string;
  today: string;
}

/** Resolve a period against the clock once, when it is chosen. */
function makeRange(period: Period): Range {
  return { period, since: periodSince(period), today: singaporeToday() };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

function downloadCsv(filename: string, header: string[], rows: (string | number)[][]): void {
  const cell = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Section({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      {title && (
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <div className="text-sm font-medium">{title}</div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Download className="h-3.5 w-3.5" /> CSV
    </button>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        'px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide',
        right ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  mono,
}: {
  children?: React.ReactNode;
  right?: boolean;
  mono?: boolean;
}) {
  return (
    <td
      className={cn(
        'px-4 py-2.5 text-sm align-top',
        right && 'text-right tabular-nums',
        mono && 'font-mono text-xs',
      )}
    >
      {children}
    </td>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{text}</p>;
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Counts up to `value` when it changes; shows it at once for reduced motion. */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (reduce) return;
    const controls = animate(0, value, {
      duration: 0.9,
      ease: EASE_OUT,
      onUpdate: (latest) => setShown(latest),
    });
    return () => controls.stop();
  }, [value, reduce]);
  return <>{format(reduce ? value : Math.round(shown))}</>;
}

function Stat({
  label,
  value,
  format = (n) => number.format(n),
  hint,
  index = 0,
}: {
  label: string;
  /** Number to count up to; `null` while loading. */
  value: number | null;
  format?: (n: number) => string;
  hint?: string;
  index?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT, delay: index * 0.06 }}
      whileHover={reduce ? undefined : { y: -2 }}
      className="rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {value == null ? '…' : <CountUp value={value} format={format} />}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </motion.div>
  );
}

/** A table row that fades up in sequence (the first 24 rows; the rest at once). */
function Row({
  index,
  className,
  onClick,
  title,
  children,
}: {
  index: number;
  className?: string;
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.tr
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT, delay: Math.min(index, 24) * 0.03 }}
      className={className}
      onClick={onClick}
      title={title}
    >
      {children}
    </motion.tr>
  );
}

/** Tab body that fades in each time its tab is shown. */
function TabBody({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Daily requests as a single-series bar chart (one hue, no legend; the title
 * names it). Days without activity are shown as gaps so the time axis stays
 * honest. The "By day" table below is the table view.
 */
function DailyChart({
  days,
  since,
  today,
}: {
  days: UsageBucket[];
  since?: string;
  today: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const reduce = useReducedMotion();

  const series = useMemo(() => {
    const byKey = new Map(days.map((d) => [d.key, d]));
    if (days.length === 0) return [];
    const toUtcDay = (key: string) => Date.parse(`${key}T00:00:00Z`);
    const first = since
      ? toUtcDay(new Date(Date.parse(since) + 8 * 3600 * 1000).toISOString().slice(0, 10))
      : toUtcDay(days[0].key);
    const last = Math.max(toUtcDay(today), toUtcDay(days[days.length - 1].key));
    const out: { key: string; ms: number; bucket?: UsageBucket }[] = [];
    for (let ms = first; ms <= last && out.length < 400; ms += DAY_MS) {
      const key = new Date(ms).toISOString().slice(0, 10);
      out.push({ key, ms, bucket: byKey.get(key) });
    }
    return out;
  }, [days, since, today]);

  if (series.length === 0) return <Empty text="No usage in this period." />;

  const max = Math.max(1, ...series.map((d) => d.bucket?.requests ?? 0));
  const W = 1000;
  const H = 180;
  const padL = 36;
  const padB = 22;
  const plotW = W - padL;
  const plotH = H - padB - 8;
  const slot = plotW / series.length;
  const barW = Math.max(2, Math.min(28, slot - 2));
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const labelEvery = Math.ceil(series.length / 8);
  const hovered = hover != null ? series[hover] : null;

  return (
    <div className="relative px-4 pb-3 pt-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-48 w-full"
        role="img"
        aria-label="AI requests per day"
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => {
          const y = 8 + plotH - (t / max) * plotH;
          return (
            <g key={t}>
              <line x1={padL} x2={W} y1={y} y2={y} className="stroke-border" strokeWidth={1} />
              <text
                x={padL - 6}
                y={y + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[11px]"
              >
                {compact.format(t)}
              </text>
            </g>
          );
        })}
        {series.map((d, i) => {
          const v = d.bucket?.requests ?? 0;
          const h = (v / max) * plotH;
          const x = padL + i * slot + (slot - barW) / 2;
          const y = 8 + plotH - h;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={d.key}>
              {/* Hit target: the whole column, bigger than the mark. */}
              <rect
                x={padL + i * slot}
                y={8}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
              {v > 0 && (
                <motion.path
                  initial={reduce ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.6, ease: EASE_OUT, delay: Math.min(i, 40) * 0.012 }}
                  style={{ transformBox: 'fill-box', originX: 0.5, originY: 1 }}
                  d={`M${x},${8 + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${8 + plotH} Z`}
                  fill="#0284c7"
                  opacity={hover == null || hover === i ? 1 : 0.45}
                  pointerEvents="none"
                />
              )}
              {i % labelEvery === 0 && (
                <text
                  x={padL + i * slot + slot / 2}
                  y={H - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {shortDay.format(new Date(d.ms))}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute top-2 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: `${Math.min(85, Math.max(5, ((hover! + 0.5) / series.length) * 100))}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="font-medium">{shortDay.format(new Date(hovered.ms))}</div>
          <div className="text-muted-foreground">
            {number.format(hovered.bucket?.requests ?? 0)} requests ·{' '}
            {number.format(hovered.bucket?.totalTokens ?? 0)} tokens
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminDashboard() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [courses, setCourses] = useState<AdminCourse[] | null>(null);
  const [usage, setUsage] = useState<UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<Range>(() => makeRange('30d'));
  const { period, since, today } = range;
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [tab, setTab] = useState('users');

  const loadDirectory = useCallback(async () => {
    const [u, c] = await Promise.all([
      getJson<{ users: AdminUser[] }>('/api/admin/users'),
      getJson<{ courses: AdminCourse[] }>('/api/admin/courses'),
    ]);
    setUsers(u.users);
    setCourses(c.courses);
  }, []);

  const loadUsage = useCallback(async () => {
    const params = new URLSearchParams({ scope: 'all' });
    if (since) params.set('since', since);
    if (selectedOwner) params.set('owner', selectedOwner);
    setUsage(await getJson<UsageReport>(`/api/usage?${params}`));
  }, [since, selectedOwner]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadDirectory(), loadUsage()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load admin data');
    } finally {
      setLoading(false);
    }
  }, [loadDirectory, loadUsage]);

  // Reload whenever the period or the selected user changes. Scheduled rather
  // than called inline so the effect itself never sets state synchronously.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const userByOwner = useMemo(() => new Map((users ?? []).map((u) => [u.ownerId, u])), [users]);
  const displayName = (ownerId: string) => userByOwner.get(ownerId)?.name || shortOwner(ownerId);
  const selectedUser = selectedOwner ? userByOwner.get(selectedOwner) : undefined;

  const q = query.trim().toLowerCase();
  const visibleUsers = (users ?? []).filter(
    (u) =>
      !q || [u.name, u.email, u.department, u.userId].some((v) => v?.toLowerCase().includes(q)),
  );
  const visibleCourses = (courses ?? []).filter(
    (c) =>
      (!selectedOwner || c.ownerId === selectedOwner) &&
      (!q ||
        [c.name, c.ownerName ?? '', c.ownerEmail ?? '', c.ownerId].some((v) =>
          v.toLowerCase().includes(q),
        )),
  );

  const focusUser = (ownerId: string) => {
    setSelectedOwner(ownerId);
    setTab('usage');
  };

  const periodLabel = PERIODS.find((p) => p.id === period)!.label.toLowerCase();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Back to home"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold">Admin</h1>
              <p className="text-sm text-muted-foreground">
                People who have signed in, the courses they made, and AI usage.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search name, email or course"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-64"
            />
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Filters: one row, above everything they affect. */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-lg border bg-muted/40 p-0.5"
            role="group"
            aria-label="Period"
          >
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setRange(makeRange(p.id))}
                className={cn(
                  'rounded-md px-3 py-1 text-sm transition-colors',
                  period === p.id
                    ? 'bg-background font-medium shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-pressed={period === p.id}
              >
                {p.label}
              </button>
            ))}
          </div>
          {selectedOwner && (
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-sky-50 px-3 py-1 text-sm text-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
              Showing {selectedUser?.name || shortOwner(selectedOwner)}
              <button
                type="button"
                onClick={() => setSelectedOwner(null)}
                aria-label="Show everyone"
                className="rounded-full p-0.5 hover:bg-sky-100 dark:hover:bg-sky-900"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat index={0} label="Users" value={users ? users.length : null} hint="all time" />
          <Stat
            index={1}
            label="Courses"
            value={courses ? visibleCourses.length : null}
            hint={selectedOwner ? 'this user' : 'all time'}
          />
          <Stat
            index={2}
            label="AI requests"
            value={usage ? usage.totals.requests : null}
            hint={periodLabel}
          />
          <Stat
            index={3}
            label="Text tokens"
            value={usage ? usage.totals.llmTokens : null}
            format={(n) => compact.format(n)}
            hint={periodLabel}
          />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="users">
              <Users className="h-4 w-4" /> Users
            </TabsTrigger>
            <TabsTrigger value="courses">
              <BookOpen className="h-4 w-4" /> Courses
            </TabsTrigger>
            <TabsTrigger value="usage">
              <BarChart3 className="h-4 w-4" /> Usage
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4">
            <TabBody>
              <Section
                title="Everyone who has signed in"
                action={
                  <ExportButton
                    onClick={() =>
                      downloadCsv(
                        'openmaic-users.csv',
                        [
                          'Name',
                          'Email',
                          'User ID',
                          'Department',
                          'Courses',
                          'AI requests',
                          'Text tokens',
                          'Sign-ins',
                          'Last active',
                          'First seen',
                        ],
                        visibleUsers.map((u) => [
                          u.name,
                          u.email,
                          u.userId,
                          u.department,
                          u.courseCount,
                          u.requests,
                          u.llmTokens,
                          u.loginCount,
                          formatDate(u.lastActiveAt),
                          formatDate(u.firstSeenAt),
                        ]),
                      )
                    }
                  />
                }
              >
                {visibleUsers.length === 0 ? (
                  <Empty text={users ? 'No one has signed in yet.' : 'Loading…'} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b bg-muted/40">
                        <tr>
                          <Th>Name</Th>
                          <Th>Department</Th>
                          <Th right>Courses</Th>
                          <Th right>AI requests</Th>
                          <Th right>Text tokens</Th>
                          <Th right>Sign-ins</Th>
                          <Th>Last active</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {visibleUsers.map((u, i) => (
                          <Row
                            index={i}
                            key={u.ownerId}
                            className="cursor-pointer hover:bg-muted/30"
                            onClick={() => focusUser(u.ownerId)}
                            title="Show this person's usage and courses"
                          >
                            <Td>
                              <div className="font-medium">{u.name || shortOwner(u.ownerId)}</div>
                              <div className="text-xs text-muted-foreground">
                                {u.email || shortOwner(u.ownerId)}
                              </div>
                            </Td>
                            <Td>{u.department}</Td>
                            <Td right>{number.format(u.courseCount)}</Td>
                            <Td right>{number.format(u.requests)}</Td>
                            <Td right>{number.format(u.llmTokens)}</Td>
                            <Td right>{number.format(u.loginCount)}</Td>
                            <Td>{formatDate(u.lastActiveAt ?? u.lastSeenAt)}</Td>
                          </Row>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
              <p className="mt-2 text-xs text-muted-foreground">
                Totals here are all time. Click a person to see their usage and courses.
              </p>
            </TabBody>
          </TabsContent>

          <TabsContent value="courses" className="mt-4">
            <TabBody>
              <Section
                title={selectedOwner ? `Courses by ${displayName(selectedOwner)}` : 'All courses'}
                action={
                  <ExportButton
                    onClick={() =>
                      downloadCsv(
                        'openmaic-courses.csv',
                        [
                          'Course',
                          'Owner',
                          'Owner email',
                          'Scenes',
                          'Status',
                          'Created',
                          'Updated',
                          'Link',
                        ],
                        visibleCourses.map((c) => [
                          c.name,
                          c.ownerName ?? shortOwner(c.ownerId),
                          c.ownerEmail ?? '',
                          c.sceneCount,
                          c.generationComplete ? 'Complete' : 'Generating',
                          formatDate(c.createdAt),
                          formatDate(c.updatedAt),
                          `${window.location.origin}/classroom/${c.id}`,
                        ]),
                      )
                    }
                  />
                }
              >
                {visibleCourses.length === 0 ? (
                  <Empty
                    text={
                      courses
                        ? 'No courses saved on the server yet. Courses appear here once they are created or opened after server storage was switched on.'
                        : 'Loading…'
                    }
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b bg-muted/40">
                        <tr>
                          <Th>Course</Th>
                          <Th>Owner</Th>
                          <Th right>Scenes</Th>
                          <Th>Created</Th>
                          <Th>Updated</Th>
                          <Th />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {visibleCourses.map((c, i) => (
                          <Row index={i} key={c.id} className="hover:bg-muted/30">
                            <Td>
                              <div className="font-medium">{c.name || 'Untitled course'}</div>
                              {!c.generationComplete && (
                                <div className="text-xs text-amber-700 dark:text-amber-400">
                                  Still generating
                                </div>
                              )}
                            </Td>
                            <Td>
                              <button
                                type="button"
                                className="text-left hover:underline"
                                onClick={() => setSelectedOwner(c.ownerId)}
                              >
                                {c.ownerName || shortOwner(c.ownerId)}
                              </button>
                              <div className="text-xs text-muted-foreground">{c.ownerEmail}</div>
                            </Td>
                            <Td right>{number.format(c.sceneCount)}</Td>
                            <Td>{formatDate(c.createdAt)}</Td>
                            <Td>{formatDate(c.updatedAt)}</Td>
                            <Td>
                              <a
                                href={`/classroom/${encodeURIComponent(c.id)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                              >
                                Open <ExternalLink className="h-3 w-3" />
                              </a>
                            </Td>
                          </Row>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
              <p className="mt-2 text-xs text-muted-foreground">
                View only. Courses open read-only; only their owner can change or delete them.
              </p>
            </TabBody>
          </TabsContent>

          <TabsContent value="usage" className="mt-4">
            <TabBody className="space-y-4">
              {!usage ? (
                <Section>
                  <Empty text="Loading…" />
                </Section>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {['llm', 'image', 'tts', 'asr']
                      .map((kind) => usage.byKind.find((b) => b.key === kind))
                      .filter((b): b is UsageBucket => !!b)
                      .map((b, i) => (
                        <Stat
                          key={b.key}
                          index={i}
                          label={KIND_LABELS[b.key] ?? b.key}
                          value={amountOf(b)}
                          format={(n) => compact.format(n)}
                          hint={`${KIND_UNITS[b.key] ?? ''} · ${number.format(b.requests)} requests`}
                        />
                      ))}
                  </div>

                  <Section title="AI requests per day">
                    <DailyChart days={usage.byDay} since={since} today={today} />
                  </Section>

                  {!selectedOwner && (
                    <Section
                      title="By user"
                      action={
                        <ExportButton
                          onClick={() =>
                            downloadCsv(
                              `openmaic-usage-by-user-${period}.csv`,
                              ['User', 'Requests', 'Text tokens', 'Other units'],
                              (usage.byUser ?? []).map((b) => [
                                b.key === 'unknown' ? 'Not attributed' : displayName(b.key),
                                b.requests,
                                b.totalTokens,
                                b.quantity,
                              ]),
                            )
                          }
                        />
                      }
                    >
                      {(usage.byUser ?? []).length === 0 ? (
                        <Empty text="No usage in this period." />
                      ) : (
                        <table className="w-full">
                          <thead className="border-b bg-muted/40">
                            <tr>
                              <Th>User</Th>
                              <Th right>Requests</Th>
                              <Th right>Text tokens</Th>
                              <Th right>Other units</Th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {(usage.byUser ?? []).map((b, i) => (
                              <Row
                                index={i}
                                key={b.key}
                                className={cn(
                                  b.key !== 'unknown' && 'cursor-pointer hover:bg-muted/30',
                                )}
                                onClick={() => b.key !== 'unknown' && setSelectedOwner(b.key)}
                              >
                                <Td>
                                  {b.key === 'unknown'
                                    ? 'Not attributed (before per-user tracking)'
                                    : displayName(b.key)}
                                </Td>
                                <Td right>{number.format(b.requests)}</Td>
                                <Td right>{number.format(b.totalTokens)}</Td>
                                <Td right>{number.format(b.quantity)}</Td>
                              </Row>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </Section>
                  )}

                  <Section
                    title="By model"
                    action={
                      <ExportButton
                        onClick={() =>
                          downloadCsv(
                            `openmaic-usage-by-model-${period}.csv`,
                            ['Model', 'Type', 'Requests', 'Amount', 'Unit'],
                            usage.byModel.map((b) => [
                              modelName(b.key),
                              KIND_LABELS[b.kind] ?? b.kind,
                              b.requests,
                              amountOf(b),
                              KIND_UNITS[b.kind] ?? '',
                            ]),
                          )
                        }
                      />
                    }
                  >
                    {usage.byModel.length === 0 ? (
                      <Empty text="No usage in this period." />
                    ) : (
                      <table className="w-full">
                        <thead className="border-b bg-muted/40">
                          <tr>
                            <Th>Model</Th>
                            <Th>Type</Th>
                            <Th right>Requests</Th>
                            <Th right>Amount</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {usage.byModel.map((b, i) => (
                            <Row index={i} key={b.key}>
                              <Td mono>{modelName(b.key)}</Td>
                              <Td>{KIND_LABELS[b.kind] ?? b.kind}</Td>
                              <Td right>{number.format(b.requests)}</Td>
                              <Td right>
                                {number.format(amountOf(b))}{' '}
                                <span className="text-muted-foreground">{KIND_UNITS[b.kind]}</span>
                              </Td>
                            </Row>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </Section>

                  <Section
                    title="By day"
                    action={
                      <ExportButton
                        onClick={() =>
                          downloadCsv(
                            `openmaic-usage-by-day-${period}.csv`,
                            ['Day', 'Requests', 'Text tokens'],
                            usage.byDay.map((b) => [b.key, b.requests, b.totalTokens]),
                          )
                        }
                      />
                    }
                  >
                    {usage.byDay.length === 0 ? (
                      <Empty text="No usage in this period." />
                    ) : (
                      <table className="w-full">
                        <thead className="border-b bg-muted/40">
                          <tr>
                            <Th>Day</Th>
                            <Th right>Requests</Th>
                            <Th right>Text tokens</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {[...usage.byDay].reverse().map((b, i) => (
                            <Row index={i} key={b.key}>
                              <Td>{b.key}</Td>
                              <Td right>{number.format(b.requests)}</Td>
                              <Td right>{number.format(b.totalTokens)}</Td>
                            </Row>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </Section>
                  <p className="text-xs text-muted-foreground">
                    Days are counted in {usage.timeZone ?? 'Singapore'} time.
                  </p>
                </>
              )}
            </TabBody>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
