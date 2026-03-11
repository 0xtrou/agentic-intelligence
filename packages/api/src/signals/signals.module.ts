import { Module } from '@nestjs/common';
import { SignalsController } from './signals.controller';
import { SignalsService } from './signals.service';
import { DiscordWebhookService } from './discord-webhook.service';

@Module({
  controllers: [SignalsController],
  providers: [SignalsService, DiscordWebhookService],
  exports: [SignalsService],
})
export class SignalsModule {}
