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

export interface Consumer {
  id: string;
  name: string;
  auth: JwksAuth | ApiKeyAuth;
  allowedCallbackDomains?: string[];
}

let consumers: Consumer[] | undefined;

export function getConsumers(): Consumer[] {
  if (consumers) return consumers;

  const raw = process.env['CONSUMERS'];
  if (raw) {
    consumers = JSON.parse(raw) as Consumer[];
    return consumers;
  }

  // Fallback: single API key consumer from env
  const apiKey = process.env['CONSUMER_API_KEY'];
  if (apiKey) {
    consumers = [{
      id: 'default',
      name: 'Default API Key Consumer',
      auth: { mode: 'api-key', key: apiKey },
    }];
    return consumers;
  }

  // No consumers configured — auth disabled (local dev)
  consumers = [];
  return consumers;
}

export function findConsumerByApiKey(key: string): Consumer | undefined {
  return getConsumers().find(
    c => c.auth.mode === 'api-key' && c.auth.key === key,
  );
}

export function getJwksConsumers(): Consumer[] {
  return getConsumers().filter(c => c.auth.mode === 'jwks');
}
