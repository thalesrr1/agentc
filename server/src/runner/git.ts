import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { GitBaseline } from '../types/index.js';

function runGit(args: string[], cwd: string): string {
  try {
    const output = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Não usar trim() global pois o formato porcelain usa a primeira coluna com espaço (ex: ' M ')
    return output.replace(/\r\n/g, '\n').trimEnd();
  } catch (err: unknown) {
    // Se o repositório não tiver commits ainda ou erro de git
    return '';
  }
}

function getFileFingerprint(absPath: string): string | null {
  try {
    if (!fs.existsSync(absPath)) return null;
    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) return 'dir';
    if (stat.size < 2 * 1024 * 1024) {
      const content = fs.readFileSync(absPath);
      return crypto.createHash('sha1').update(content).digest('hex');
    }
    return `${stat.size}:${stat.mtimeMs}`;
  } catch {
    return null;
  }
}

export const GitService = {
  /**
   * Captura o baseline do repositório antes de iniciar a execução da tarefa
   */
  getBaseline(projectPath: string): GitBaseline {
    // Commit HEAD atual
    let commit = runGit(['rev-parse', 'HEAD'], projectPath).trim();
    if (!commit) {
      commit = '0000000000000000000000000000000000000000';
    }

    // Arquivos modificados antes da execução
    const statusOutput = runGit(['status', '--porcelain'], projectPath);
    const dirtyFilesBefore: string[] = [];
    const fingerprintsBefore: Record<string, string> = {};

    if (statusOutput) {
      const lines = statusOutput.split('\n');
      for (const rawLine of lines) {
        if (rawLine.length > 3) {
          let filePath = rawLine.substring(3).trim().replace(/^"|"$/g, '');
          if (filePath.includes(' -> ')) {
            const parts = filePath.split(' -> ');
            filePath = (parts[1] || parts[0] || '').trim().replace(/^"|"$/g, '');
          }
          if (filePath) {
            const normalized = filePath.replace(/\\/g, '/');
            dirtyFilesBefore.push(normalized);
            const absPath = path.join(projectPath, normalized);
            const fp = getFileFingerprint(absPath);
            if (fp) {
              fingerprintsBefore[normalized] = fp;
            }
          }
        }
      }
    }

    return {
      commit,
      dirty_files_before: dirtyFilesBefore,
      fingerprints_before: fingerprintsBefore,
    };
  },

  /**
   * Calcula cirurgicamente os arquivos afetados após a execução da tarefa
   */
  calculateAffectedFiles(projectPath: string, baseline: GitBaseline): string[] {
    const statusOutput = runGit(['status', '--porcelain'], projectPath);
    const currentDirtyFiles: string[] = [];

    if (statusOutput) {
      const lines = statusOutput.split('\n');
      for (const rawLine of lines) {
        if (rawLine.length > 3) {
          let filePath = rawLine.substring(3).trim().replace(/^"|"$/g, '');
          if (filePath.includes(' -> ')) {
            const parts = filePath.split(' -> ');
            filePath = (parts[1] || parts[0] || '').trim().replace(/^"|"$/g, '');
          }
          if (filePath) {
            currentDirtyFiles.push(filePath.replace(/\\/g, '/'));
          }
        }
      }
    }

    // Se houve novos commits durante a execução
    const currentCommit = runGit(['rev-parse', 'HEAD'], projectPath);
    const committedFiles: string[] = [];
    if (
      currentCommit &&
      baseline.commit &&
      currentCommit !== baseline.commit &&
      baseline.commit !== '0000000000000000000000000000000000000000'
    ) {
      const diffTreeOutput = runGit(
        ['diff-tree', '--no-commit-id', '--name-only', '-r', `${baseline.commit}..${currentCommit}`],
        projectPath
      );
      if (diffTreeOutput) {
        committedFiles.push(...diffTreeOutput.split('\n').filter((f) => f.trim().length > 0));
      }
    }

    // Arquivos que surgiram ou foram modificados especificamente nesta run:
    // 1. Arquivos comitados entre o baseline e o HEAD atual
    // 2. Arquivos novos que não estavam dirty antes
    // 3. Arquivos pré-existentes dirty cujo conteúdo foi efetivamente alterado durante esta run
    const dirtySetBefore = new Set((baseline.dirty_files_before || []).map((f) => f.replace(/\\/g, '/')));
    const fingerprintsBefore = baseline.fingerprints_before || {};
    const affected = new Set<string>();

    for (const f of committedFiles) {
      const normalized = f.replace(/\\/g, '/');
      if (!normalized.startsWith('.agent/')) {
        affected.add(normalized);
      }
    }

    for (const f of currentDirtyFiles) {
      const normalized = f.replace(/\\/g, '/');
      if (normalized.startsWith('.agent/')) {
        continue;
      }

      // Se o arquivo NÃO estava dirty antes da run, ele certamente foi criado ou modificado por esta run
      if (!dirtySetBefore.has(normalized)) {
        affected.add(normalized);
      } else {
        // Se o arquivo JÁ ESTAVA dirty antes da run:
        // Ele SÓ deve ser considerado afetado se o seu conteúdo mudou durante esta run!
        const beforeFingerprint = fingerprintsBefore[normalized];
        const absPath = path.join(projectPath, normalized);
        const currentFingerprint = getFileFingerprint(absPath);

        if (beforeFingerprint && currentFingerprint) {
          if (beforeFingerprint !== currentFingerprint) {
            affected.add(normalized);
          }
        } else if (beforeFingerprint && !currentFingerprint) {
          // Arquivo foi deletado durante a run
          affected.add(normalized);
        } else if (!beforeFingerprint && currentFingerprint) {
          // Não tínhamos fingerprint antes mas agora existe
          affected.add(normalized);
        }
      }
    }

    return Array.from(affected);
  },

  /**
   * Gera diff unificado direcionado apenas para a lista de affected_files
   */
  getUnifiedDiff(projectPath: string, affectedFiles: string[]): string {
    if (affectedFiles.length === 0) {
      return '';
    }

    const diffs: string[] = [];

    // Diff de arquivos rastreados
    const trackedArgs = ['diff', 'HEAD', '--', ...affectedFiles];
    const trackedDiff = runGit(trackedArgs, projectPath);
    if (trackedDiff) {
      diffs.push(trackedDiff);
    }

    // Checa se há arquivos novos untracked dentre os affectedFiles para simular diff de adição
    const statusOutput = runGit(['status', '--porcelain', '--', ...affectedFiles], projectPath);
    if (statusOutput) {
      const lines = statusOutput.split('\n');
      for (const line of lines) {
        if (line.startsWith('?? ')) {
          const relPath = line.substring(3).trim().replace(/^"|"$/g, '');
          const fullPath = path.join(projectPath, relPath);
          if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
            try {
              const fileContent = fs.readFileSync(fullPath, 'utf8');
              const linesCount = fileContent.split('\n').length;
              let syntheticDiff = `diff --git a/${relPath} b/${relPath}\n`;
              syntheticDiff += `new file mode 100644\n`;
              syntheticDiff += `--- /dev/null\n`;
              syntheticDiff += `+++ b/${relPath}\n`;
              syntheticDiff += `@@ -0,0 +1,${linesCount} @@\n`;
              for (const contentLine of fileContent.split('\n')) {
                syntheticDiff += `+${contentLine}\n`;
              }
              diffs.push(syntheticDiff);
            } catch {
              // ignora se binário ou erro de leitura
            }
          }
        }
      }
    }

    return diffs.join('\n\n');
  },

  /**
   * Gera diff stat resumido direcionado para context limit da LLM
   */
  getDiffStat(projectPath: string, affectedFiles: string[]): string {
    if (affectedFiles.length === 0) {
      return 'Nenhum arquivo modificado nesta tarefa.';
    }

    const stat = runGit(['diff', '--stat', 'HEAD', '--', ...affectedFiles], projectPath);
    if (stat) {
      return stat;
    }

    // Se foram apenas arquivos novos untracked
    return `${affectedFiles.length} arquivo(s) novo(s) adicionado(s): ${affectedFiles.join(', ')}`;
  },

  /**
   * Reverte cirurgicamente os arquivos afetados (usado pelo Fail-Safe do modo Scout)
   */
  revertAffectedFiles(projectPath: string, affectedFiles: string[], baseline?: GitBaseline): void {
    if (!affectedFiles || affectedFiles.length === 0) {
      return;
    }

    const dirtySetBefore = new Set((baseline?.dirty_files_before || []).map((f) => f.replace(/\\/g, '/')));
    const trackedFiles: string[] = [];
    const untrackedFiles: string[] = [];

    for (const relPath of affectedFiles) {
      const normalized = relPath.replace(/\\/g, '/');
      // Protege incondicionalmente a pasta de execuções
      if (normalized.startsWith('.agent/')) {
        continue;
      }

      // SEGURANÇA MÁXIMA: Se o arquivo já estava dirty antes da tarefa começar,
      // NUNCA execute git checkout ou remoção que destruiria trabalho prévio do usuário!
      if (dirtySetBefore.has(normalized)) {
        continue;
      }

      // Checa se o arquivo é rastreado pelo Git
      const lsResult = runGit(['ls-files', '--error-unmatch', normalized], projectPath);
      if (lsResult) {
        trackedFiles.push(normalized);
      } else {
        untrackedFiles.push(normalized);
      }
    }

    // Restaura arquivos rastreados modificados ou deletados
    if (trackedFiles.length > 0) {
      runGit(['restore', '--staged', '--worktree', '--', ...trackedFiles], projectPath);
      runGit(['checkout', 'HEAD', '--', ...trackedFiles], projectPath);
    }

    // Remove arquivos novos não rastreados criados indevidamente
    for (const relPath of untrackedFiles) {
      const absPath = path.join(projectPath, relPath);
      try {
        if (fs.existsSync(absPath)) {
          const stat = fs.statSync(absPath);
          if (stat.isDirectory()) {
            fs.rmSync(absPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(absPath);
          }
        }
      } catch {
        runGit(['clean', '-f', '--', relPath], projectPath);
      }
    }
  },
};
