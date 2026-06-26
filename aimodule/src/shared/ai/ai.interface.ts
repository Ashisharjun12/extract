export type AIInputData = 
  | { inlineData: { data: string; mimeType: string } }
  | { fileData: { fileUri: string; mimeType: string } };

export interface IAIProvider {
  generateStructuredContent(
    inputData: AIInputData | AIInputData[] | null,
    prompt: string,
    schema?: any,
    maxRetries?: number,
    maxOutputTokens?: number,
    modelOverride?: string,
    cacheKey?: string,
    callPhase?: 'prescreen' | 'extraction',
  ): Promise<any>;
  uploadFile?(filePath: string, mimeType: string, filename: string): Promise<string>;
  deleteFile?(fileUri: string): Promise<void>;
}

