import { Global, Module } from '@nestjs/common';
import { RedisModule as NestRedisModule } from '@nestjs-modules/ioredis';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [
    NestRedisModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'single',
        url: `redis://${config.get('redis.host')}:${config.get('redis.port')}/${config.get('redis.db')}`,
        options: {
          password: config.get('redis.password'),
          // 连接超时设置
          connectTimeout: 10000,
          // 心跳设置
          pingInterval: 30000, // 每30秒发送一次心跳
          // 重连设置
          retryStrategy: (times: number) => {
            // 指数退避策略，最大重试间隔为30秒
            return Math.min(times * 100, 30000);
          },
          // 最大重试次数
          maxRetriesPerRequest: 3,
          // 启用就绪检查
          enableReadyCheck: true,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
