import { Module, forwardRef } from '@nestjs/common';
import { SignalsController } from './signals.controller';
import { SignalsService } from './signals.service';
import { DiscordWebhookService } from './discord-webhook.service';
import { TradesModule } from '../trades/trades.module';

@Module({
  imports: [forwardRef(() => TradesModule)],
  controllers: [SignalsController],
  providers: [SignalsService, DiscordWebhookService],
  exports: [SignalsService],
})
export class SignalsModule {}
