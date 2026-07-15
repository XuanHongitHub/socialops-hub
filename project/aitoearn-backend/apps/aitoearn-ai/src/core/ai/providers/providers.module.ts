import { Module } from '@nestjs/common'
import { ChatModule } from '../chat'
import { ProvidersController } from './providers.controller'
import { ProvidersService } from './providers.service'

@Module({
  imports: [ChatModule],
  controllers: [ProvidersController],
  providers: [ProvidersService],
  exports: [ProvidersService],
})
export class ProvidersModule {}
