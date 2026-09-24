import { execFileSync } from 'node:child_process';
import os from 'node:os';

/**
 * Verifica se um comando executável de CLI está instalado e acessível no PATH do sistema.
 */
export function isCliAvailable(cliName: string): boolean {
  const isWin = os.platform() === 'win32';
  const checkCmd = isWin ? 'where.exe' : 'which';

  const variants: string[] = [cliName];
  if (isWin && !cliName.includes('.')) {
    variants.push(`${cliName}.cmd`, `${cliName}.exe`, `${cliName}.bat`);
  }

  for (const cmd of variants) {
    try {
      const result = execFileSync(checkCmd, [cmd], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      });
      if (result && result.trim().length > 0) {
        return true;
      }
    } catch {
      // Continua checando variações
    }
  }

  return false;
}
