export interface IStorageService {
  uploadFile(filePath: string, destination: string, mimeType: string): Promise<string>;
}
