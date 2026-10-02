import { Module } from '@nestjs/common';
import { ProductionController } from './production.controller';
import { OverviewService } from './overview.service';
import { ProductionService } from './production.service';

@Module({
  controllers: [ProductionController],
  providers: [ProductionService, OverviewService],
})
export class ProductionModule {}
