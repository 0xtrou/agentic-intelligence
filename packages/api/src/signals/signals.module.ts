import { Module } from '@nestjs/common';
import { SignalsController } from './signals.controller';
import { DiscordWebhookService } from './discord-webhook.service';

@Module({
  controllers: [SignalsController],
  providers: [DiscordWebhookService],
})
export class SignalsModule {}
