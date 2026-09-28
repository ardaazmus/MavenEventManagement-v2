// ─── P03.1: Fail-Closed Konfigürasyon Doğrulaması ─────────────────────────────
// Üretim ortamında auth=off yalnız açık MAVEN_DEMO_MODE=on bayrağı ile çalışabilir.
// Üretim secret anahtarı minimum 32 karakter entropi gerektirir.
// Geliştirme ve test ortamlarında ergonomik fallback'ler korunur.

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

export interface AppConfig {
  nodeEnv: "development" | "production" | "test";
  isProd: boolean;
  isDev: boolean;
  isTest: boolean;
  authEnabled: boolean;
  isDemoMode: boolean;
  secretKey: string;
  databaseUrl: string;
  origin: string;
  rpId: string;
}

export const DEV_FALLBACK_SECRET = "maven-dev-only-secret-key-change-me";

export function validateConfig(rawEnv: Record<string, string | undefined> = process.env): AppConfig {
  const nodeEnv = (rawEnv.NODE_ENV || "development") as "development" | "production" | "test";
  const isProd = nodeEnv === "production";
  const isDev = nodeEnv === "development";
  const isTest = nodeEnv === "test";

  const databaseUrl = rawEnv.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new ConfigValidationError("DATABASE_URL is required and cannot be empty");
  }

  const authFlag = (rawEnv.MAVEN_AUTH || "").trim().toLowerCase();
  const authEnabled = authFlag === "on";

  const demoFlag = (rawEnv.MAVEN_DEMO_MODE || "").trim().toLowerCase();
  const isDemoMode = demoFlag === "on";

  // Production safety check:
  // Production + auth-off + no demo flag -> fatal startup failure
  if (isProd && !authEnabled && !isDemoMode) {
    throw new ConfigValidationError(
      "Fatal configuration error: Running in production with MAVEN_AUTH=off requires MAVEN_DEMO_MODE=on to be explicitly set.",
    );
  }

  const rawSecret = rawEnv.MAVEN_SECRET_KEY?.trim();
  let secretKey: string;

  if (isProd) {
    if (!rawSecret) {
      throw new ConfigValidationError("MAVEN_SECRET_KEY is mandatory in production environment");
    }
    if (rawSecret === DEV_FALLBACK_SECRET) {
      throw new ConfigValidationError("MAVEN_SECRET_KEY cannot use development fallback in production");
    }
    if (rawSecret.length < 32) {
      throw new ConfigValidationError(
        `MAVEN_SECRET_KEY does not meet minimum entropy/length requirements (minimum 32 characters, got ${rawSecret.length})`,
      );
    }
    secretKey = rawSecret;
  } else {
    secretKey = rawSecret || DEV_FALLBACK_SECRET;
  }

  const origin = rawEnv.MAVEN_ORIGIN || "http://localhost:3000";
  const rpId = rawEnv.MAVEN_RPID || "localhost";

  return {
    nodeEnv,
    isProd,
    isDev,
    isTest,
    authEnabled,
    isDemoMode,
    secretKey,
    databaseUrl,
    origin,
    rpId,
  };
}

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = validateConfig(process.env);
  }
  return cachedConfig;
}

export function resetConfigCache(): void {
  cachedConfig = null;
}
