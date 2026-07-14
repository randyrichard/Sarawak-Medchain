/**
 * OpenAPI 3.0 description of the public API surface. Served at
 * GET /api/v1/openapi.json for import into Postman / Swagger / procurement
 * review. Kept hand-maintained and concise — it documents the contract, not
 * every internal detail.
 */
import { config } from '../config.js';

const bearer = [{ bearerAuth: [] }];
const apiKey = [{ apiKeyAuth: [] }];

function op(summary: string, tag: string, extra: Record<string, unknown> = {}) {
  return { summary, tags: [tag], responses: { '200': { description: 'Success' } }, ...extra };
}

export function openApiSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Sarawak MedChain e-MC API',
      version: '1.0.0',
      description:
        'National Digital Medical Certificate platform. Public verification is unauthenticated; ' +
        'all other endpoints require a JWT bearer token, and employer bulk verification uses an API key.',
      contact: { name: 'Sarawak MedChain' },
    },
    servers: [
      { url: config.isProd ? 'https://api.emc.gov.my' : `http://localhost:${config.port}`, description: 'API server' },
    ],
    tags: [
      { name: 'Auth', description: 'Authentication, 2FA, password lifecycle' },
      { name: 'Verification', description: 'Public MC verification (the QR target)' },
      { name: 'Certificates', description: 'MC issuance and lifecycle (doctor/patient)' },
      { name: 'Facility', description: 'Hospital/clinic administration' },
      { name: 'Admin', description: 'KKM / State administration' },
      { name: 'Notifications', description: 'In-app notification feed' },
      { name: 'API Keys', description: 'Employer HR-system integration keys' },
      { name: 'System', description: 'Health and metadata' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
      },
    },
    paths: {
      '/healthz': { get: op('Liveness probe + chain-anchoring mode', 'System') },
      '/readyz': { get: op('Readiness probe (checks database)', 'System') },
      '/api/v1/openapi.json': { get: op('This OpenAPI document', 'System') },

      '/api/v1/auth/register': { post: op('Self-registration (patient/employer)', 'Auth') },
      '/api/v1/auth/login': { post: op('Email + password login (may require 2FA)', 'Auth') },
      '/api/v1/auth/login/2fa': { post: op('Complete login with a TOTP code', 'Auth') },
      '/api/v1/auth/refresh': { post: op('Rotate refresh token (reuse revokes all sessions)', 'Auth') },
      '/api/v1/auth/logout': { post: op('Revoke the current session', 'Auth', { security: bearer }) },
      '/api/v1/auth/forgot-password': { post: op('Begin account recovery (no account enumeration)', 'Auth') },
      '/api/v1/auth/reset-password': { post: op('Complete password reset with a one-time token', 'Auth') },
      '/api/v1/auth/change-password': { post: op('Change password (revokes other sessions)', 'Auth', { security: bearer }) },
      '/api/v1/auth/2fa/setup': { post: op('Begin TOTP enrollment (returns QR)', 'Auth', { security: bearer }) },
      '/api/v1/auth/2fa/enable': { post: op('Confirm and enable TOTP', 'Auth', { security: bearer }) },

      '/api/v1/verify/{hash}': {
        get: {
          ...op('Verify a certificate by its canonical hash', 'Verification'),
          parameters: [{ name: 'hash', in: 'path', required: true, schema: { type: 'string' }, description: '0x-prefixed keccak-256 hash' }],
        },
      },
      '/api/v1/verify/bulk': { post: op('Bulk verify up to 100 hashes (HR integration)', 'Verification', { security: apiKey }) },

      '/api/v1/mcs': {
        get: {
          ...op('List own certificates (cursor-paginated)', 'Certificates', { security: bearer }),
          parameters: [
            { name: 'take', in: 'query', schema: { type: 'integer', maximum: 100 } },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
          ],
        },
        post: op('Issue and digitally sign an MC (doctor)', 'Certificates', { security: bearer }),
      },
      '/api/v1/mcs/{id}/revoke': { post: op('Revoke an MC (issuing doctor)', 'Certificates', { security: bearer }) },
      '/api/v1/mcs/{id}/amend': { post: op('Amend an MC — supersede + reissue', 'Certificates', { security: bearer }) },
      '/api/v1/mcs/{id}/pdf': { get: op('Download the official signed PDF', 'Certificates', { security: bearer }) },
      '/api/v1/mcs/{id}/qr': { get: op('On-screen verification QR (data URL)', 'Certificates', { security: bearer }) },
      '/api/v1/mcs/{id}/share': { post: op('Create a time-limited share link (patient)', 'Certificates', { security: bearer }) },

      '/api/v1/facility/me': { get: op('Facility profile + counts', 'Facility', { security: bearer }) },
      '/api/v1/facility/doctors': {
        get: op('List facility doctors', 'Facility', { security: bearer }),
        post: op('Register a doctor (generates signing keypair)', 'Facility', { security: bearer }),
      },
      '/api/v1/facility/doctors/{id}/suspend': { post: op('Suspend a doctor', 'Facility', { security: bearer }) },
      '/api/v1/facility/doctors/{id}/reinstate': { post: op('Reinstate a doctor', 'Facility', { security: bearer }) },
      '/api/v1/facility/analytics': { get: op('Facility issuance analytics', 'Facility', { security: bearer }) },

      '/api/v1/admin/facilities': {
        get: op('List facilities (?status filter)', 'Admin', { security: bearer }),
        post: op('Register a facility', 'Admin', { security: bearer }),
      },
      '/api/v1/admin/facilities/{id}/approve': { post: op('Approve a facility', 'Admin', { security: bearer }) },
      '/api/v1/admin/facilities/{id}/suspend': { post: op('Suspend a facility', 'Admin', { security: bearer }) },
      '/api/v1/admin/facilities/{id}/admins': { post: op('Provision a facility administrator', 'Admin', { security: bearer }) },
      '/api/v1/admin/fraud-alerts': { get: op('Fraud alert queue', 'Admin', { security: bearer }) },
      '/api/v1/admin/fraud-alerts/{id}/review': { post: op('Review a fraud alert', 'Admin', { security: bearer }) },
      '/api/v1/admin/audit': { get: op('Audit trail (paginated)', 'Admin', { security: bearer }) },
      '/api/v1/admin/audit.csv': { get: op('Export audit trail as CSV', 'Admin', { security: bearer }) },
      '/api/v1/admin/audit/integrity': { get: op('Verify the audit hash chain', 'Admin', { security: bearer }) },
      '/api/v1/admin/analytics': { get: op('National analytics', 'Admin', { security: bearer }) },

      '/api/v1/search': { post: op('Role-scoped MC search', 'Admin', { security: bearer }) },
      '/api/v1/search/csv': { post: op('Export MC search results as CSV', 'Admin', { security: bearer }) },
      '/api/v1/notifications': { get: op('Notification feed', 'Notifications', { security: bearer }) },
      '/api/v1/notifications/read-all': { post: op('Mark all notifications read', 'Notifications', { security: bearer }) },
      '/api/v1/notifications/{id}/read': { post: op('Mark one notification read', 'Notifications', { security: bearer }) },
      '/api/v1/api-keys': {
        get: op('List employer API keys', 'API Keys', { security: bearer }),
        post: op('Create an API key (shown once)', 'API Keys', { security: bearer }),
      },
      '/api/v1/api-keys/{id}/revoke': { post: op('Revoke an API key', 'API Keys', { security: bearer }) },
    },
  };
}
