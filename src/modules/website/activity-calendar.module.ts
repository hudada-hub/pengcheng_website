import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { I18nModule } from '../../i18n/i18n.module';
import { WebsiteModule } from './website.module';
import { ActivityCalendarController } from './activity-calendar.controller';
import { ActivityCalendarService } from './activity-calendar.service';
import { ActivityCalendar } from '../../entities/activity-calendar.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActivityCalendar]),
    I18nModule,
    WebsiteModule,
  ],
  controllers: [ActivityCalendarController],
  providers: [ActivityCalendarService],
})
export class ActivityCalendarModule {}
