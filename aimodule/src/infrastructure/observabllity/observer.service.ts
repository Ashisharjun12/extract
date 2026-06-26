import { IObserverProvider } from '../../shared/observablity/observer.interface.js';
import { ObserverFactory } from '../../shared/observablity/observer.factory.js';


export class ObserverService {
  private static instance: IObserverProvider;

  private constructor() {}

  public static getInstance(): IObserverProvider {
    if (!ObserverService.instance) {
      ObserverService.instance = ObserverFactory.getObserver();
    }
    return ObserverService.instance;
  }
}
