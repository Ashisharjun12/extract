import { AIFactory, AIProviderType } from '../../shared/ai/ai.factory';
import { IAIProvider } from '../../shared/ai/ai.interface';
import { CircuitBreakerFactory } from '../resilence/resilence';
import CircuitBreaker from 'opossum';
import { _config } from '../../config/config.js';

export class AIService {
  private static instance: AIService;
  private aiProvider: IAIProvider;
  private circuitBreaker: CircuitBreaker;

  private constructor() {
    const factory = AIFactory.getInstance();
    // Defaulting to GEMINI
    this.aiProvider = factory.getProvider(AIProviderType.GEMINI);
    this.circuitBreaker = CircuitBreakerFactory.create(
      async (inputData: any, prompt: string, schema?: any, maxRetries = 3, maxOutputTokens?: number, modelOverride?: string, cacheKey?: string, callPhase?: 'prescreen' | 'extraction') => {
        return this.aiProvider.generateStructuredContent(inputData, prompt, schema, maxRetries, maxOutputTokens, modelOverride, cacheKey, callPhase);
      },
      'Gemini-AI-Provider',
      {
        timeout: _config.GEMINI_CIRCUIT_TIMEOUT_MS,
        errorThresholdPercentage: 50,
        resetTimeout: _config.GEMINI_CIRCUIT_RESET_TIMEOUT_MS,
      }
    );
  }

  // get the instance of the AI service
  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }


  // process the document

  public async processDocument(
    inputData: any,
    prompt: string,
    schema?: any,
    maxOutputTokens?: number,
    modelOverride?: string,
    maxRetries = 3,
    cacheKey?: string,
    callPhase: 'prescreen' | 'extraction' = 'extraction',
  ): Promise<any> {
    return this.circuitBreaker.fire(inputData, prompt, schema, maxRetries, maxOutputTokens, modelOverride, cacheKey, callPhase);
  }

  // get the circuit breaker
  public getBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  // upload file to the storage
  public async uploadFile(filePath: string, mimeType: string, filename: string): Promise<string> {
    if (this.aiProvider.uploadFile) {
      return this.aiProvider.uploadFile(filePath, mimeType, filename);
    }
    throw new Error('uploadFile is not implemented for the current AI Provider.');
  }

  // delete file from the storage
  public async deleteFile(fileUri: string): Promise<void> {
    if (this.aiProvider.deleteFile) {
      return this.aiProvider.deleteFile(fileUri);
    }
  }
}
