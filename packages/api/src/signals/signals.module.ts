import { Module } from '@nestjs/common';
import { SignalsController } from './signals.controller';

@Module({
  controllers: [SignalsController],
  providers: [],
})
export class SignalsModule {}
