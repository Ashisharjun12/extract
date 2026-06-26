import { StorageFactory } from '../../shared/storage/storage.factory';
import { IStorageService } from '../../shared/storage/storage.interface';

export class StorageService {
  private static instance: StorageService;
  private storageProvider: IStorageService;

  private constructor() {
    this.storageProvider = StorageFactory.getStorageService();
  }

  public static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  public async uploadFile(filePath: string, destination: string, mimeType: string): Promise<string> {
    return this.storageProvider.uploadFile(filePath, destination, mimeType);
  }
}
