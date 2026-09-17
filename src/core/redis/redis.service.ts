import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { parseRedisConnection } from '../utils/redis.util.js';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const redisConfig = parseRedisConnection(
      this.configService.get<string>('REDIS_URL'),
      this.configService.get<string>('REDIS_HOST', 'localhost'),
      this.configService.get<number>('REDIS_PORT', 6379),
    );

    this.client = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      tls: redisConfig.tls,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.client.on('connect', () => {
      this.logger.log('Redis client connected successfully');
    });

    this.client.on('error', (err) => {
      this.logger.error(`Redis client error: ${err.message}`, err.stack);
    });
  }

  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  /**
   * Atomically gets the value and deletes the key to prevent replay attacks.
   */
  async getdel(key: string): Promise<string | null> {
    // Redis 6.2+ has native GETDEL command
    try {
      return await (this.client as any).getdel(key);
    } catch {
      // Fallback for older Redis versions using Lua or pipeline
      const pipeline = this.client.pipeline();
      pipeline.get(key);
      pipeline.del(key);
      const results = await pipeline.exec();
      if (!results || !results[0]) return null;
      return results[0][1] as string | null;
    }
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const count = await this.client.exists(key);
    return count > 0;
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  async onModuleDestroy() {
    if (this.client) {
      this.logger.log('Disconnecting Redis client...');
      await this.client.quit();
    }
  }
}
