import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  appVersion: process.env.APP_VERSION ?? '0.0.0',

  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'jnk_portal_base',
    // Duas formas de passar o certificado CA do cluster MySQL, à escolha de
    // quem hospedar: caminho de arquivo (bom localmente/Droplet) ou o
    // conteúdo do .pem direto numa env var (bom em App Platform, onde não
    // dá pra simplesmente colocar um arquivo ao lado do processo).
    caCertPath: process.env.DB_CA_CERT_PATH || undefined,
    caCertContent: process.env.DB_CA_CERT || undefined,
  },

  jwtSecret: () => required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',

  parametrosEncryptionKey: () => required('PARAMETROS_ENCRYPTION_KEY'),

  azureAd: {
    tenantId: process.env.AZURE_AD_TENANT_ID || undefined,
    clientId: process.env.AZURE_AD_CLIENT_ID || undefined,
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET || undefined,
    redirectUri: process.env.AZURE_AD_REDIRECT_URI || undefined,
  },
};

export const azureAdHabilitado = Boolean(
  env.azureAd.tenantId && env.azureAd.clientId && env.azureAd.clientSecret && env.azureAd.redirectUri,
);
