/**
 * Consumer registration — defines which apps can call the Monolith Docs API.
 *
 * Consumers are configured via environment variables (keep Docs stateless).
 * Format: CONSUMERS='[{"id":"crm","name":"Monolith CRM","auth":{"mode":"jwks","jwksUrl":"https://..."}},...]'
 *
 * For simple setups, a single API key consumer can be configured via:
 *   CONSUMER_API_KEY=some-secret-key  (creates a default "api-key" consumer)
 */

export interface JwksAuth {
  mode: 'jwks';
  jwksUrl: string;
  audience?: string;
  issuer?: string;
}

export interface ApiKeyAuth {
  mode: 'api-key';
  key: string;
}

export interface HmacAuth {
  mode: 'hmac';
  secret: string;
  issuer: string;
  audience?: string;
}

export interface Consumer {
  id: string;
  name: string;
  auth: JwksAuth | ApiKeyAuth | HmacAuth;
  /** Bind this consumer to a specific request hostname. Only requests on this hostname can authenticate as this consumer. */
  hostname?: string;
  /** Domains allowed for callbackUrl. Empty array = no callbacks (standalone only). Undefined = allow any (dev compat). */
  allowedCallbackDomains?: string[];
}

let consumers: Consumer[] | undefined;

/**
 * Validate consumer configuration. Returns array of error messages (empty = valid).
 */
export function validateConsumersConfig(consumerList: Consumer[], isProduction: boolean): string[] {
  const errors: string[] = [];

  const ids = new Set<string>();
  for (const c of consumerList) {
    if (ids.has(c.id)) errors.push(`Duplicate consumer ID: ${c.id}`);
    ids.add(c.id);
  }

  const hostnames = new Set<string>();
  for (const c of consumerList) {
    if (c.hostname) {
      if (hostnames.has(c.hostname)) errors.push(`Duplicate consumer hostname: ${c.hostname}`);
      hostnames.add(c.hostname);
    }
  }

  for (const c of consumerList) {
    if (c.auth.mode === 'hmac') {
      if (c.auth.secret.length < 32) {
        errors.push(`Consumer ${c.id}: HMAC secret must be at least 32 characters`);
      }
      if (!c.auth.issuer) {
        errors.push(`Consumer ${c.id}: HMAC auth requires an issuer`);
      }
    }
    if (c.auth.mode === 'jwks') {
      if (!c.auth.jwksUrl?.startsWith('https://')) {
        errors.push(`Consumer ${c.id}: JWKS URL must start with https://`);
      }
    }
    if (c.auth.mode === 'api-key' && isProduction) {
      errors.push(`Consumer ${c.id}: API key auth mode is not allowed in production (use hmac or jwks)`);
    }
  }

  return errors;
}

export function getConsumers(): Consumer[] {
  if (consumers) return consumers;

  const raw = process.env['CONSUMERS'];
  if (raw) {
    consumers = JSON.parse(raw) as Consumer[];
  } else {
    // Fallback: single API key consumer from env
    const apiKey = process.env['CONSUMER_API_KEY'];
    if (apiKey) {
      consumers = [{
        id: 'default',
        name: 'Default API Key Consumer',
        auth: { mode: 'api-key', key: apiKey },
      }];
    } else {
      // No consumers configured — auth disabled (local dev)
      consumers = [];
    }
  }

  // Validate on first load
  const isProduction = (process.env['NODE_ENV'] ?? 'development') === 'production';
  const errors = validateConsumersConfig(consumers, isProduction);
  if (errors.length > 0 && isProduction) {
    throw new Error(`Invalid consumer configuration:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }
  if (errors.length > 0) {
    for (const e of errors) console.warn(`Consumer config warning: ${e}`);
  }

  return consumers;
}

/** Reset cached consumers (for testing) */
export function resetConsumers(): void {
  consumers = undefined;
}

/** Force set consumers for testing (bypasses env parsing) */
export function setConsumersForTest(list: Consumer[]): void {
  consumers = list;
}

export function findConsumerByApiKey(key: string): Consumer | undefined {
  return getConsumers().find(
    c => c.auth.mode === 'api-key' && c.auth.key === key,
  );
}

export function getJwksConsumers(): Consumer[] {
  return getConsumers().filter(c => c.auth.mode === 'jwks');
}

export function getHmacConsumers(): Consumer[] {
  return getConsumers().filter(c => c.auth.mode === 'hmac');
}

/**
 * Find consumers that can authenticate on the given hostname.
 * If any consumers are bound to this hostname, return only those.
 * If none are bound, return consumers with no hostname set (backward compat for dev).
 */
export function findConsumersByHostname(hostname: string): Consumer[] {
  const all = getConsumers();
  const bound = all.filter(c => c.hostname === hostname);
  return bound.length > 0 ? bound : all.filter(c => !c.hostname);
}

/**
 * Validate that a callbackUrl is allowed for the given consumer.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateCallbackDomain(consumer: Consumer, callbackUrl: string, isProduction: boolean): string | null {
  if (!consumer.allowedCallbackDomains) {
    // Field not set — allow any callback (backward compat for dev/legacy consumers)
    return null;
  }

  if (consumer.allowedCallbackDomains.length === 0) {
    return 'This consumer does not allow callbacks (standalone mode only)';
  }

  let parsed: URL;
  try {
    parsed = new URL(callbackUrl);
  } catch {
    return `Invalid callback URL: ${callbackUrl}`;
  }

  if (isProduction && parsed.protocol !== 'https:') {
    return 'Callback URL must use HTTPS in production';
  }

  const allowed = consumer.allowedCallbackDomains.some(domain =>
    parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
  );

  if (!allowed) {
    return `Callback domain ${parsed.hostname} not in allowed list: ${consumer.allowedCallbackDomains.join(', ')}`;
  }

  return null;
}
