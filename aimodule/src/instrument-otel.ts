
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ATTR_SERVICE_NAME, ATTR_DEPLOYMENT_ENVIRONMENT_NAME } from '@opentelemetry/semantic-conventions';
import { _config } from './config/config.js';

let sdkStarted = false;

export function isOtelEnabled(): boolean {
  return _config.OTEL_ENABLED === true;
}

export function isOtelTracesEnabled(): boolean {
  return _config.OTEL_ENABLED === true && _config.OTEL_TRACES_ENABLED === true;
}

export function isOtelReady(): boolean {
  return sdkStarted;
}

if (isOtelEnabled()) {
  const endpoint = _config.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '');
  const metricsUrl = endpoint.endsWith('/v1/metrics') ? endpoint : `${endpoint}/v1/metrics`;
  const tracesUrl = _config.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT.replace(/\/$/, '');

  const metricExporter = new OTLPMetricExporter({ url: metricsUrl });

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: _config.OTEL_SERVICE_NAME,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: _config.NODE_ENV ?? 'development',
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 15_000,
    }),
    ...(isOtelTracesEnabled() && {
      traceExporter: new OTLPTraceExporter({ url: tracesUrl }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-dns': { enabled: false },
          '@opentelemetry/instrumentation-net': { enabled: false },
          '@opentelemetry/instrumentation-http': { enabled: true },
          '@opentelemetry/instrumentation-express': { enabled: true },
        }),
      ],
    }),
    ...(!isOtelTracesEnabled() && { instrumentations: [] }),
  });

  sdk.start();
  sdkStarted = true;

  const shutdown = () => {
    sdk.shutdown().catch(() => undefined);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
