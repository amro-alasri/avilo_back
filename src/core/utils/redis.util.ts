export interface RedisConnectionConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, any>;
}

/**
 * Parses a Redis connection URL (e.g., redis://localhost:6379 or rediss://:password@host:6380/0)
 * into a structured connection object compatible with BullMQ and ioredis.
 */
export function parseRedisConnection(
  redisUrl?: string,
  fallbackHost = 'localhost',
  fallbackPort = 6379
): RedisConnectionConfig {
  if (!redisUrl || typeof redisUrl !== 'string') {
    return { host: fallbackHost, port: fallbackPort };
  }

  try {
    const trimmed = redisUrl.trim();
    const normalizedUrl = trimmed.includes('://') ? trimmed : `redis://${trimmed}`;
    const parsed = new URL(normalizedUrl);
    const isTls = parsed.protocol === 'rediss:';
    const host = parsed.hostname || fallbackHost;
    const port = parsed.port ? parseInt(parsed.port, 10) : fallbackPort;
    const username = parsed.username ? decodeURIComponent(parsed.username) : undefined;
    const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
    const db =
      parsed.pathname && parsed.pathname.length > 1
        ? parseInt(parsed.pathname.slice(1), 10)
        : undefined;

    return {
      host,
      port,
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
      ...(db !== undefined && !isNaN(db) ? { db } : {}),
      ...(isTls ? { tls: {} } : {}),
    };
  } catch {
    return { host: fallbackHost, port: fallbackPort };
  }
}
