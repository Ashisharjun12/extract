import { IObserverProvider } from './observer.interface.js';
import { PinoObserverProvider } from './provider/pino.js';
import { NewRelicObserverProvider } from './provider/newrelic.js';
import { SignozObserverProvider } from './provider/signoz.js';
import { CompositeObserverProvider } from './provider/composite.js';
import { _config } from '../../config/config.js';

/**
 * ObserverFactory — mirrors AIFactory / StorageFactory.
 *
 * Reads OBSERVABILITY_PROVIDER from config:
 *   'pino'     → Pino only (structured JSON logs)
 *   'newrelic' → New Relic only (APM + custom events)
 *   'both'     → Pino + New Relic
 *   'signoz'   → Pino + OTel/SigNoz custom metrics
 *   'all'      → Pino + New Relic + OTel/SigNoz (verify SigNoz, then drop NR)
 *
 * OTel SDK starts when OTEL_ENABLED=true (see instrument-otel.ts).
 */
export class ObserverFactory {
  static getObserver(): IObserverProvider {
    const pino = new PinoObserverProvider();
    const nr = new NewRelicObserverProvider();
    const signoz = new SignozObserverProvider();

    switch (_config.OBSERVABILITY_PROVIDER) {
      case 'newrelic':
        return nr;
      case 'pino':
        return pino;
      case 'signoz':
        return new CompositeObserverProvider([pino, signoz]);
      case 'all':
        return new CompositeObserverProvider([pino, nr, signoz]);
      case 'both':
        return new CompositeObserverProvider([pino, nr]);
      default:
        return nr;
    }
  }
}
