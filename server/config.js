const DEFAULT_FALLBACK_SECRET = 'fixcraft_local_jwt_secret_key_2026';
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];

// Parses comma-separated allowed CORS origins into an array of strings
export function parseAllowedOrigins(originsStr) {
  if (!originsStr || typeof originsStr !== 'string') {
    return DEFAULT_ALLOWED_ORIGINS;
  }
  const parsed = originsStr
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_ALLOWED_ORIGINS;
}

// Parses Express trust proxy setting from environment string or number
export function parseTrustProxy(trustProxyVal) {
  if (trustProxyVal === 'true') {
    return true;
  }
  if (trustProxyVal === 'false') {
    return false;
  }
  const parsedNum = Number(trustProxyVal);
  if (!Number.isNaN(parsedNum) && parsedNum >= 0) {
    return parsedNum;
  }
  return 1;
}

// Enforces minimum 32-character JWT secret and disallows default fallback in production
export function validateJwtSecret(secret, nodeEnv) {
  if (nodeEnv === 'production') {
    if (!secret || secret.length < 32) {
      throw new Error('FATAL: In production, JWT_SECRET must be set and be at least 32 characters long.');
    }
    if (secret === DEFAULT_FALLBACK_SECRET) {
      throw new Error('FATAL: In production, JWT_SECRET cannot be the default fallback key.');
    }
  }
  return secret || DEFAULT_FALLBACK_SECRET;
}

// Builds centralized environment configuration object
export function createConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const port = Number(env.PORT) || 3001;
  const jwtSecret = validateJwtSecret(env.JWT_SECRET, nodeEnv);
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  const trustProxy = parseTrustProxy(env.TRUST_PROXY);

  return {
    port,
    nodeEnv,
    jwtSecret,
    allowedOrigins,
    trustProxy,
  };
}

const config = createConfig();

export default config;
