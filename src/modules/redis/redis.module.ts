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
        options: config.get('redis.password')
          ? { password: config.get('redis.password') }
          : {},
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
