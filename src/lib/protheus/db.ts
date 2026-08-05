import sql from 'mssql';

const config: sql.config = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  server: process.env.MSSQL_SERVER as string,
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: 10000,
  requestTimeout: 20000,
};

const globalForProtheus = globalThis as unknown as { protheusPool?: Promise<sql.ConnectionPool> };

export function getProtheusPool(): Promise<sql.ConnectionPool> {
  if (!globalForProtheus.protheusPool) {
    globalForProtheus.protheusPool = new sql.ConnectionPool(config).connect();
  }
  return globalForProtheus.protheusPool as Promise<sql.ConnectionPool>;
}
