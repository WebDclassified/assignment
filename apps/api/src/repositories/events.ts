import { ObjectId } from "mongodb";
import type { MongoClient } from "mongodb";
import { canonicalPageUrl } from "@pathlens/contracts";
import type {
  Event,
  SessionSummary,
  HeatmapPage,
  HeatmapClick,
  HeatmapGrid,
  ViewportClass,
} from "@pathlens/contracts";

// Upper bound of raw points scanned when building a server-side density grid.
const GRID_BINNING_CAP = 5000;

export interface ListSessionsOptions {
  siteId: string;
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
  search?: string;
}

export interface GetSessionEventsOptions {
  siteId: string;
  sessionId: string;
  page: number;
  pageSize: number;
}

export interface SessionEventsResult {
  data: Event[];
  total: number;
}

export interface DailyTrend {
  date: string;
  pageViews: number;
  clicks: number;
  events: number;
}

export interface SiteInfo {
  siteId: string;
  events: number;
  sessions: number;
  lastActivityAt: string;
}

export interface ListHeatmapPagesOptions {
  siteId: string;
  from?: string;
  to?: string;
}

export interface GetHeatmapClicksOptions {
  siteId: string;
  pageUrl: string;
  viewportClass: ViewportClass;
  viewportWidthThresholds: { mobileMaxWidth: number; tabletMaxWidth: number };
  from?: string;
  to?: string;
  limit: number;
  gridSize?: number;
}

export interface SummaryStatsOptions {
  siteId: string;
  from?: string;
  to?: string;
}

export interface SessionAggregationResult {
  data: SessionSummary[];
  total: number;
}

export interface HeatmapClicksResult {
  data: HeatmapClick[];
  total: number;
  grid?: HeatmapGrid;
}

export interface SummaryStats {
  events: number;
  sessions: number;
  pageViews: number;
  clicks: number;
}

export interface EventRepository {
  ingest(events: Event[]): Promise<number>;
  listSessions(options: ListSessionsOptions): Promise<SessionAggregationResult>;
  getSessionEvents(options: GetSessionEventsOptions): Promise<SessionEventsResult>;
  getDailyTrends(options: SummaryStatsOptions): Promise<DailyTrend[]>;
  listSites(): Promise<SiteInfo[]>;
  listHeatmapPages(options: ListHeatmapPagesOptions): Promise<HeatmapPage[]>;
  getHeatmapClicks(options: GetHeatmapClicksOptions): Promise<HeatmapClicksResult>;
  getSummaryStats(options: SummaryStatsOptions): Promise<SummaryStats>;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// MongoDB stores event times as BSON dates so range filters, sorting, and
// indexes compare chronologically. The API contract stays ISO-8601 strings,
// so every read path converts dates back with toIso().
function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}

export class MongoEventRepository implements EventRepository {
  private readonly databaseName: string;

  constructor(client: MongoClient, databaseName?: string) {
    this.client = client;
    this.databaseName = databaseName ?? process.env.MONGODB_DATABASE ?? "pathlens";
  }

  private readonly client: MongoClient;

  private collection = () => this.client.db(this.databaseName).collection("events");

  private dailyStats = () => this.client.db(this.databaseName).collection("site_daily_stats");

  private static dayOf(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  // Precomputed per-site, per-day counters so trend queries never scan the
  // raw event stream. Only genuinely new documents are counted, so retried
  // batches cannot inflate the rollups.
  private async recordDailyRollups(
    docs: Array<{ siteId: string; type: string; occurredAt: Date }>,
  ): Promise<void> {
    if (docs.length === 0) return;
    const buckets = new Map<string, { siteId: string; day: string; pageViews: number; clicks: number; events: number }>();
    for (const doc of docs) {
      const day = MongoEventRepository.dayOf(doc.occurredAt);
      const key = `${doc.siteId}|${day}`;
      const bucket = buckets.get(key) ?? { siteId: doc.siteId, day, pageViews: 0, clicks: 0, events: 0 };
      bucket.events += 1;
      if (doc.type === "page_view") bucket.pageViews += 1;
      if (doc.type === "click") bucket.clicks += 1;
      buckets.set(key, bucket);
    }
    await this.dailyStats().bulkWrite(
      [...buckets.values()].map((bucket) => ({
        updateOne: {
          filter: { siteId: bucket.siteId, day: bucket.day },
          update: {
            $inc: { events: bucket.events, pageViews: bucket.pageViews, clicks: bucket.clicks },
            $setOnInsert: { siteId: bucket.siteId, day: bucket.day },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  async ingest(events: Event[]): Promise<number> {
    const collection = this.collection();
    const ids = events.map((event) => event.eventId);

    if (events.length === 0) return 0;

    // Normalize untrusted client input before storage: strip query strings
    // and fragments from page URLs, derive the pathname, and persist event
    // times as dates so range queries and indexes behave chronologically.
    const docs = events.map((event) => {
      const pageUrl = canonicalPageUrl(event.pageUrl) || event.pageUrl;
      return {
        ...event,
        pageUrl,
        pathname: new URL(pageUrl).pathname,
        occurredAt: new Date(event.occurredAt),
        receivedAt: new Date(),
        _id: new ObjectId(),
      };
    });

    const preExisting = await collection
      .find({ eventId: { $in: ids } })
      .project({ _id: 0, eventId: 1 })
      .toArray();
    const preExistingIds = new Set(
      (preExisting as unknown as Array<{ eventId: string }>).map((doc) => doc.eventId),
    );

    const rollupNewDocs = async (candidateIds: string[]): Promise<void> => {
      const fresh = docs.filter((doc) => candidateIds.includes(doc.eventId));
      if (fresh.length > 0) {
        await this.recordDailyRollups(fresh);
      }
    };

    try {
      await collection.insertMany(docs, { ordered: false });
      const inserted = docs.filter((doc) => !preExistingIds.has(doc.eventId));
      await this.recordDailyRollups(inserted);
      return inserted.length;
    } catch (error: unknown) {
      const mongoError = error as { codeName?: string; code?: number };
      if (mongoError?.codeName === "DuplicateKey" || mongoError?.code === 11000) {
        const present = await collection
          .find({ eventId: { $in: ids } })
          .project({ _id: 0, eventId: 1 })
          .toArray();
        const presentIds = (present as unknown as Array<{ eventId: string }>).map(
          (doc) => doc.eventId,
        );
        await rollupNewDocs(presentIds.filter((id) => !preExistingIds.has(id)));
        return Math.max(0, presentIds.length - preExistingIds.size);
      }
      throw error;
    }
  }

  async listSessions({ siteId, page, pageSize, from, to, search }: ListSessionsOptions): Promise<SessionAggregationResult> {
    const collection = this.collection();
    const match: Record<string, unknown> = { siteId };
    if (search) {
      match.sessionId = { $regex: escapeRegex(search), $options: "i" };
    }
    if (from && to) {
      match.occurredAt = { $gte: new Date(from), $lte: new Date(to) };
    } else if (from) {
      match.occurredAt = { $gte: new Date(from) };
    } else if (to) {
      match.occurredAt = { $lte: new Date(to) };
    }

    // Pagination totals count distinct sessions, not events.
    const totalRows = await collection
      .aggregate<{ total: number }>([
        { $match: match },
        { $group: { _id: "$sessionId" } },
        { $count: "total" },
      ])
      .toArray();
    const total = totalRows[0]?.total ?? 0;

    const data = await collection
      .aggregate([
        { $match: match },
        {
          $group: {
            _id: { siteId: "$siteId", sessionId: "$sessionId" },
            eventCount: { $sum: 1 },
            pageViews: { $sum: { $cond: [{ $eq: ["$type", "page_view"] }, 1, 0] } },
            clicks: { $sum: { $cond: [{ $eq: ["$type", "click"] }, 1, 0] } },
            startedAt: { $min: "$occurredAt" },
            lastActivityAt: { $max: "$occurredAt" },
          },
        },
        { $sort: { lastActivityAt: -1 } },
        { $skip: (page - 1) * pageSize },
        { $limit: pageSize },
        {
          $project: {
            _id: 0,
            sessionId: "$_id.sessionId",
            eventCount: 1,
            pageViews: 1,
            clicks: 1,
            startedAt: 1,
            lastActivityAt: 1,
            durationSeconds: {
              $dateDiff: { startDate: "$startedAt", endDate: "$lastActivityAt", unit: "second" },
            },
          },
        },
      ])
      .toArray();

    const sessions = (data as unknown as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      startedAt: toIso(row.startedAt),
      lastActivityAt: toIso(row.lastActivityAt),
    }));

    return { data: sessions as unknown as SessionSummary[], total };
  }

  async getSessionEvents({ siteId, sessionId, page, pageSize }: GetSessionEventsOptions): Promise<SessionEventsResult> {
    const collection = this.collection();
    const filter = { siteId, sessionId };
    const [cursor, total] = await Promise.all([
      collection
        .find(filter)
        .sort({ occurredAt: 1, receivedAt: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .project({
          _id: 0,
          eventId: 1,
          type: 1,
          pageUrl: 1,
          occurredAt: 1,
          coordinates: 1,
          viewport: 1,
          document: 1,
          referrerOrigin: 1,
          receivedAt: 1,
        }),
      collection.countDocuments(filter),
    ]);
    const rows = await cursor.toArray();

    const normalized = (rows as unknown as Array<Record<string, unknown>>).map((event) => ({
      ...event,
      occurredAt: toIso(event.occurredAt),
      receivedAt: toIso(event.receivedAt),
    }));

    return { data: normalized as unknown as Event[], total };
  }

  async listHeatmapPages({ siteId, from, to }: ListHeatmapPagesOptions): Promise<HeatmapPage[]> {
    const collection = this.collection();
    const match: Record<string, unknown> = { siteId, type: "click" };
    if (from && to) {
      match.occurredAt = { $gte: new Date(from), $lte: new Date(to) };
    } else if (from) {
      match.occurredAt = { $gte: new Date(from) };
    } else if (to) {
      match.occurredAt = { $lte: new Date(to) };
    }

    const rows = await collection
      .aggregate([
        { $match: match },
        {
          $group: {
            _id: "$pageUrl",
            clicks: { $sum: 1 },
          },
        },
        { $sort: { clicks: -1, _id: 1 } },
        {
          $project: {
            _id: 0,
            pageUrl: "$_id",
            clicks: 1,
          },
        },
      ])
      .toArray();

    return rows as unknown as HeatmapPage[];
  }

  async getHeatmapClicks({
    siteId,
    pageUrl,
    viewportClass,
    viewportWidthThresholds,
    from,
    to,
    limit,
    gridSize,
  }: GetHeatmapClicksOptions): Promise<HeatmapClicksResult> {
    const collection = this.collection();
    const match: Record<string, unknown> = {
      siteId,
      pageUrl,
      type: "click",
    };

    if (viewportClass === "mobile" || viewportClass === "tablet" || viewportClass === "desktop") {
      match.$expr = {
        $eq: [
          { $cond: [{ $lte: ["$viewport.width", viewportWidthThresholds.mobileMaxWidth] }, "mobile", { $cond: [{ $lte: ["$viewport.width", viewportWidthThresholds.tabletMaxWidth] }, "tablet", "desktop"] }] },
          viewportClass,
        ],
      };
    }

    if (from && to) {
      match.occurredAt = { $gte: new Date(from), $lte: new Date(to) };
    } else if (from) {
      match.occurredAt = { $gte: new Date(from) };
    } else if (to) {
      match.occurredAt = { $lte: new Date(to) };
    }

    const [rows, total] = await Promise.all([
      collection
        .find(match)
        .sort({ occurredAt: -1 })
        .limit(limit)
        .project({
          _id: 0,
          x: "$coordinates.x",
          y: "$coordinates.y",
          viewport: 1,
          document: 1,
          occurredAt: 1,
        })
        .toArray(),
      collection.countDocuments(match),
    ]);

    const clicks = (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      occurredAt: toIso(row.occurredAt),
    }));

    if (gridSize === undefined) {
      return { data: clicks as unknown as HeatmapClick[], total };
    }

    const grid = await this.buildClickGrid(match, gridSize);
    return { data: clicks as unknown as HeatmapClick[], total, grid };
  }

  // Server-side density grid: bins click coordinates normalized by each
  // click's own document size, so mixed viewports aggregate meaningfully
  // without shipping every raw point to the browser.
  private async buildClickGrid(
    match: Record<string, unknown>,
    size: number,
  ): Promise<HeatmapGrid> {
    const rows = await this.collection()
      .find(match)
      .sort({ occurredAt: -1 })
      .limit(GRID_BINNING_CAP)
      .project({ _id: 0, x: "$coordinates.x", y: "$coordinates.y", document: 1 })
      .toArray();

    const cells = new Map<string, number>();
    for (const row of rows as unknown as Array<{
      x?: number;
      y?: number;
      document?: { width?: number; height?: number };
    }>) {
      const width = row.document?.width ?? 0;
      const height = row.document?.height ?? 0;
      if (typeof row.x !== "number" || typeof row.y !== "number" || width <= 0 || height <= 0) {
        continue;
      }
      const col = Math.min(size - 1, Math.max(0, Math.floor((row.x / width) * size)));
      const crow = Math.min(size - 1, Math.max(0, Math.floor((row.y / height) * size)));
      const key = `${col}:${crow}`;
      cells.set(key, (cells.get(key) ?? 0) + 1);
    }

    return {
      size,
      cells: [...cells.entries()]
        .map(([key, count]) => {
          const [col, row] = key.split(":").map(Number);
          return { col, row, count };
        })
        .sort((a, b) => b.count - a.count),
    };
  }

  async getSummaryStats({ siteId, from, to }: SummaryStatsOptions): Promise<SummaryStats> {
    const collection = this.collection();
    const match: Record<string, unknown> = { siteId };
    if (from && to) {
      match.occurredAt = { $gte: new Date(from), $lte: new Date(to) };
    } else if (from) {
      match.occurredAt = { $gte: new Date(from) };
    } else if (to) {
      match.occurredAt = { $lte: new Date(to) };
    }

    const result = await collection
      .aggregate<{
        totals: Array<{ events?: number; pageViews?: number; clicks?: number }>;
        sessions: Array<{ total?: number }>;
      }>([
        { $match: match },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  events: { $sum: 1 },
                  pageViews: { $sum: { $cond: [{ $eq: ["$type", "page_view"] }, 1, 0] } },
                  clicks: { $sum: { $cond: [{ $eq: ["$type", "click"] }, 1, 0] } },
                },
              },
            ],
            sessions: [{ $group: { _id: "$sessionId" } }, { $count: "total" }],
          },
        },
      ])
      .toArray();

    const totals = result[0]?.totals[0];
    return {
      events: totals?.events ?? 0,
      // Distinct sessions, not one per event.
      sessions: result[0]?.sessions[0]?.total ?? 0,
      pageViews: totals?.pageViews ?? 0,
      clicks: totals?.clicks ?? 0,
    };
  }

  async getDailyTrends({ siteId, from, to }: SummaryStatsOptions): Promise<DailyTrend[]> {
    const start = from ? new Date(from) : new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
    const end = to ? new Date(to) : new Date();
    const startDay = start.toISOString().slice(0, 10);
    const endDay = end.toISOString().slice(0, 10);

    const rows = await this.dailyStats()
      .find({ siteId, day: { $gte: startDay, $lte: endDay } })
      .project({ _id: 0, day: 1, pageViews: 1, clicks: 1, events: 1 })
      .toArray();
    const byDay = new Map<string, { pageViews?: number; clicks?: number; events?: number }>(
      (
        rows as unknown as Array<{
          day: string;
          pageViews?: number;
          clicks?: number;
          events?: number;
        }>
      ).map((row) => [row.day, row] as [string, { pageViews?: number; clicks?: number; events?: number }]),
    );

    // Fill days without traffic with zeros so charts render continuously.
    const trends: DailyTrend[] = [];
    const cursor = new Date(`${startDay}T00:00:00.000Z`);
    const last = new Date(`${endDay}T00:00:00.000Z`);
    for (; cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const day = cursor.toISOString().slice(0, 10);
      const row = byDay.get(day);
      trends.push({
        date: day,
        pageViews: row?.pageViews ?? 0,
        clicks: row?.clicks ?? 0,
        events: row?.events ?? 0,
      });
    }
    return trends;
  }

  async listSites(): Promise<SiteInfo[]> {
    const rows = await this.collection()
      .aggregate([
        {
          $group: {
            _id: { siteId: "$siteId", sessionId: "$sessionId" },
            events: { $sum: 1 },
            lastActivityAt: { $max: "$occurredAt" },
          },
        },
        {
          $group: {
            _id: "$_id.siteId",
            sessions: { $sum: 1 },
            events: { $sum: "$events" },
            lastActivityAt: { $max: "$lastActivityAt" },
          },
        },
        { $sort: { lastActivityAt: -1 } },
        {
          $project: {
            _id: 0,
            siteId: "$_id",
            sessions: 1,
            events: 1,
            lastActivityAt: 1,
          },
        },
      ])
      .toArray();

    return (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
      siteId: String(row.siteId ?? ""),
      events: typeof row.events === "number" ? row.events : 0,
      sessions: typeof row.sessions === "number" ? row.sessions : 0,
      lastActivityAt: toIso(row.lastActivityAt),
    }));
  }
}
