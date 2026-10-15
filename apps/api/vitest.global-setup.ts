import { MongoMemoryServer } from "mongodb-memory-server";

let server: MongoMemoryServer | undefined;

export async function setup(): Promise<void> {
  server = await MongoMemoryServer.create();

  // Tests must not rely on a shared/production database (docs/09).
  // These assignments happen before test workers spawn, so dotenv and the
  // ambient shell environment never override them.
  process.env.NODE_ENV = "test";
  process.env.PORT = "4000";
  process.env.MONGODB_URI = server.getUri();
  process.env.MONGODB_DATABASE = "pathlens_test";
  process.env.ALLOWED_ORIGINS ??= "http://localhost:5173";
  process.env.RATE_LIMIT_WINDOW_MS ??= "60000";
  process.env.RATE_LIMIT_MAX_REQUESTS ??= "120";
}

export async function teardown(): Promise<void> {
  await server?.stop();
  server = undefined;
}
