import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OpenAiConfig {
  constructor(private configService: ConfigService) {}

  get apiKey(): string {
    return this.configService.get<string>('OPENAI_API_KEY', '');
  }

  get model(): string {
    return this.configService.get<string>('OPENAI_MODEL', 'gpt-4-vision');
  }
}
