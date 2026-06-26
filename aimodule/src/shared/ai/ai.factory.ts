import { IAIProvider } from './ai.interface';
import { GeminiProvider } from './provider/gemini.provider';

export enum AIProviderType {
  GEMINI = 'GEMINI',
}

export class AIFactory {
  private static instance: AIFactory;

  private constructor() {}

  public static getInstance(): AIFactory {
    if (!AIFactory.instance) {
      AIFactory.instance = new AIFactory();
    }
    return AIFactory.instance;
  }

  public getProvider(type: AIProviderType): IAIProvider {
    switch (type) {
      case AIProviderType.GEMINI:
        return GeminiProvider.getInstance();
      default:
        throw new Error(`AI Provider ${type} is not supported.`);
    }
  }
}
