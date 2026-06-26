import { IStorageService } from './storage.interface';
import { GCSProvider } from './provider/gcs.provider';
import { _config } from '../../config/config.js';
import { ObserverService } from '../../infrastructure/observabllity/observer.service.js';


export class StorageFactory {
  private static instance: IStorageService;

  public static getStorageService(): IStorageService {
    if (!StorageFactory.instance) {
      const provider = _config.STORAGE_PROVIDER ?? 'gcp';

      switch (provider.toLowerCase()) {
        case 'gcp':
        default:
          ObserverService.getInstance().info(`StorageFactory: initialising GCSProvider (STORAGE_PROVIDER=${provider})`);
          StorageFactory.instance = new GCSProvider();
          break;
      }
    }
    return StorageFactory.instance;
  }
}
