import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { Admin } from '../../entities/admin.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Admin])],
  controllers: [AuthController],
  providers: [AuthService, CsrfGuard],
  exports: [AuthService],
})
export class AuthModule {}
