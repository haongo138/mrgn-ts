// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://c2875efdbe35bc4db77f24a3339a38c1@o1279738.ingest.us.sentry.io/4507934431248384",
  debug: false,
  autoSessionTracking: false,
  integrations: [],
  defaultIntegrations: false,
  enableTracing: false,
  tracesSampleRate: 0,
});
