import path from 'node:path';
import os from 'node:os';

export const CONFIG = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  HOST: process.env.HOST || '0.0.0.0',
  // Local padrão para salvar o banco SQLite no diretório de dados do usuário (~/.agentc/agentc.db)
  DB_PATH: process.env.AGENTC_DB_PATH || path.join(os.homedir(), '.agentc', 'agentc.db'),
  DEFAULT_MODEL_OPENCODE: 'minimax/MiniMax-M3',
  DEFAULT_MODEL_AGY: 'gemini-2.0-flash',
  MAX_LOG_BYTES_RETURN: 100 * 1024, // 100 KB conforme spec.md
};
