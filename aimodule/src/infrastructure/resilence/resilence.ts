import CircuitBreaker from 'opossum';
import { ObserverService } from '../observabllity/observer.service.js';

export interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  volumeThreshold?: number;
}

const defaultOptions: CircuitBreakerOptions = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 5,
};

export class CircuitBreakerFactory {
  static create<T extends (...args: any[]) => Promise<any>>(
    action: T,
    name: string,
    options: CircuitBreakerOptions = {},
  ): CircuitBreaker {
    const obs = ObserverService.getInstance();

    const breaker = new CircuitBreaker(action, {
      ...defaultOptions,
      ...options,
    });

    breaker.on('open', () => {
      obs.warn(`CircuitBreaker ${name} is OPEN. Failing fast.`);
    });

    breaker.on('close', () => {
      obs.info(`CircuitBreaker ${name} is CLOSED. Resuming normal operations.`);
    });

    breaker.on('halfOpen', () => {
      obs.info(`CircuitBreaker ${name} is HALF_OPEN. Testing service recovery.`);
    });

    breaker.on('fallback', (err: any) => {
      obs.logError(`CircuitBreaker ${name} fallback triggered`, err instanceof Error ? err : new Error(String(err?.message ?? err)));
    });

    return breaker;
  }
}
