import crypto from 'node:crypto';
import type {IncomingMessage} from 'node:http';
export const MUTATION_TOKEN = crypto.randomBytes(24).toString('hex');
export function requestGuard(req: IncomingMessage, options: {token?: string; binary?: boolean} = {}): {status: number; error: string} | null {
  const port = String(req.socket.localPort), hosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  if (!hosts.includes(String(req.headers.host))) return {status: 403, error: 'Недопустимый Host'};
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method ?? 'GET')) return null;
  const origin = req.headers.origin;
  if (origin && !hosts.map(h => 'http://' + h).includes(origin)) return {status: 403, error: 'Недопустимый Origin'};
  if (req.headers['x-motivelium-token'] !== (options.token ?? MUTATION_TOKEN)) return {status: 403, error: 'Недопустимый токен изменения'};
  if (Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding']) {
    const mime = String(req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    if (!(options.binary ? ['application/zip', 'application/octet-stream'] : ['application/json']).includes(mime)) return {status: 415, error: 'Недопустимый тип запроса'};
  }
  return null;
}
