import { MongoClient, Db, Collection } from "mongodb";
import { type Environment } from "../config/env.js";

const INDEX_DEFINITIONS: Array<{ key: Record<string, 1 | -1>; options: { name: string; unique?: boolean } }> = [
  { key: { eventId: 1 }, options: { name: "eventId_1", unique: true } },
  { key: { siteId: 1, sessionId: 1, occurredAt: 1, receivedAt: 1 }, options: { name: "siteId_1_sessionId_1_occurredAt_1" } },
  { key: { siteId: 1, pageUrl: 1, type: 1, occurredAt: 1 }, options: { name: "siteId_1_pageUrl_1_type_1_occurredAt_1" } },
  { key: { siteId: 1, occurredAt: -1 }, options: { name: "siteId_1_occurredAt_-1" } },
];

export async function createMongoClient({ MONGODB_URI, MONGODB_DATABASE, EVENT_RETENTION_DAYS }: Environment): Promise<MongoClient> {
  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
  });

  await client.connect();
  const db: Db = client.db(MONGODB_DATABASE);
  const events: Collection = db.collection("events");

  try {
    for (const { key, options } of INDEX_DEFINITIONS) {
      await events.createIndex(key, options);
    }

    // One-time migration: events written before timestamps were stored as
    // BSON dates keep occurredAt/receivedAt as strings, which silently breaks
    // every date-range query (BSON compares dates as greater than any
    // string). Convert them in place so old and new records filter together.
    const occurredAtMigrated = await events.updateMany({ occurredAt: { $type: "string" } }, [
      { $set: { occurredAt: { $toDate: "$occurredAt" } } },
    ]);
    const receivedAtMigrated = await events.updateMany({ receivedAt: { $type: "string" } }, [
      { $set: { receivedAt: { $toDate: "$receivedAt" } } },
    ]);
    if (occurredAtMigrated.modifiedCount > 0 || receivedAtMigrated.modifiedCount > 0) {
      console.log(
        `Migrated ${occurredAtMigrated.modifiedCount} occurredAt and ${receivedAtMigrated.modifiedCount} receivedAt timestamps from strings to dates.`,
      );
    }

    const stats = db.collection("site_daily_stats");
    await stats.createIndex({ siteId: 1, day: 1 }, { name: "siteId_1_day_1", unique: true });
    await backfillDailyRollups(events, stats);

    // Optional retention: expire events received more than N days ago. The
    // index is dropped again when retention is unconfigured so disabling the
    // setting restores indefinite storage.
    if (EVENT_RETENTION_DAYS !== undefined) {
      await events.createIndex(
        { receivedAt: 1 },
        { name: "receivedAt_ttl", expireAfterSeconds: EVENT_RETENTION_DAYS * 24 * 60 * 60 },
      );
      console.log(`Event retention enabled: events expire after ${EVENT_RETENTION_DAYS} day(s).`);
    } else {
      await events.dropIndex("receivedAt_ttl").catch(() => undefined);
    }
  } catch (error) {
    console.error("Failed to create indexes:", error);
    throw error;
  }

  return client;
}

// Rebuilds per-site, per-day counters for event days that predate the
// rollup writer, without touching days that already have counters.
async function backfillDailyRollups(events: Collection, stats: Collection): Promise<void> {
  const existing = await stats.find({}).project({ _id: 0, siteId: 1, day: 1 }).toArray();
  const known = new Set(existing.map((doc) => `${doc.siteId}|${doc.day}`));

  const groups = await events
    .aggregate<{
      _id: { siteId: string; day: string };
      events: number;
      pageViews: number;
      clicks: number;
    }>([
      {
        $group: {
          _id: {
            siteId: "$siteId",
            day: { $dateToString: { format: "%Y-%m-%d", date: "$occurredAt" } },
          },
          events: { $sum: 1 },
          pageViews: { $sum: { $cond: [{ $eq: ["$type", "page_view"] }, 1, 0] } },
          clicks: { $sum: { $cond: [{ $eq: ["$type", "click"] }, 1, 0] } },
        },
      },
    ])
    .toArray();

  const missing = groups.filter((group) => !known.has(`${group._id.siteId}|${group._id.day}`));
  if (missing.length === 0) return;

  await stats.insertMany(
    missing.map((group) => ({
      siteId: group._id.siteId,
      day: group._id.day,
      events: group.events,
      pageViews: group.pageViews,
      clicks: group.clicks,
    })),
  );
  console.log(`Backfilled ${missing.length} daily rollup(s) from stored events.`);
}

export async function pingDatabase(client: MongoClient): Promise<void> {
  const admin = client.db().admin();
  await admin.ping();
}
