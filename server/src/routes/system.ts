import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { MCP_TOOLS_DEFINITIONS } from '../mcp/tools.js';

export const systemRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/system/select-folder (abre diálogo nativo do Windows)
  fastify.post('/select-folder', async (_request, reply) => {
    if (os.platform() !== 'win32') {
      return reply.status(400).send({ error: 'Diálogo nativo suportado apenas no Windows' });
    }

    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      $f = New-Object System.Windows.Forms.FolderBrowserDialog
      $f.Description = 'Selecione a pasta do repositório/projeto para o AgentC'
      $f.ShowNewFolderButton = $true
      if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        Write-Output $f.SelectedPath
      }
    `.trim();

    return new Promise((resolve) => {
      execFile(
        'powershell',
        ['-STA', '-NoProfile', '-NonInteractive', '-Command', psScript],
        { windowsHide: false, encoding: 'utf8', timeout: 60000 },
        (error, stdout) => {
          if (error) {
            resolve(reply.status(500).send({ error: 'Erro ao abrir seletor de pasta', details: error.message }));
            return;
          }

          const selected = stdout.trim();
          if (!selected) {
            resolve(reply.send({ success: false, cancelled: true }));
            return;
          }

          const folderName = path.basename(selected);
          resolve(
            reply.send({
              success: true,
              path: selected,
              name: folderName,
            })
          );
        }
      );
    });
  });

  // GET /api/system/quick-folders (lista atalhos rápidos de diretórios locais)
  fastify.get('/quick-folders', async (_request, reply) => {
    const candidateDirs = ['D:\\PROJETOS', 'D:\\', process.cwd()];
    const suggestions: Array<{ name: string; path: string }> = [];

    for (const baseDir of candidateDirs) {
      if (fs.existsSync(baseDir)) {
        try {
          const entries = fs.readdirSync(baseDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              const fullPath = path.join(baseDir, entry.name);
              // Prioriza diretórios com git ou código
              suggestions.push({
                name: entry.name,
                path: fullPath,
              });
            }
          }
        } catch {
          // ignora
        }
      }
    }

    return reply.send(suggestions.slice(0, 30));
  });

  // GET /api/system/mcp-tools (lista ferramentas ativas do MCP)
  fastify.get('/mcp-tools', async (_request, reply) => {
    return reply.send({
      server: {
        name: 'agentc-mcp-server',
        version: '1.0.0',
        transport: 'stdio',
        status: 'online',
        tools_count: MCP_TOOLS_DEFINITIONS.length,
      },
      tools: MCP_TOOLS_DEFINITIONS,
    });
  });

  // POST /api/system/open-code (abre o projeto no VS Code)
  fastify.post<{ Body: { path?: string } }>('/open-code', async (request, reply) => {
    const targetPath = request.body?.path?.trim();
    if (!targetPath) {
      return reply.status(400).send({ error: 'Caminho é obrigatório' });
    }

    if (!fs.existsSync(targetPath)) {
      return reply.status(404).send({ error: 'Caminho não encontrado no disco' });
    }

    try {
      const normalizedPath = path.normalize(targetPath);
      if (os.platform() === 'win32') {
        execFile('cmd.exe', ['/c', 'code', normalizedPath], { windowsHide: true }, (err) => {
          if (err) {
            console.error('[System] Erro ao disparar VS Code:', err.message);
          }
        });
      } else {
        execFile('code', [normalizedPath], (err) => {
          if (err) {
            console.error('[System] Erro ao disparar VS Code:', err.message);
          }
        });
      }
      return reply.send({ success: true, message: 'VS Code acionado com sucesso' });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: 'Falha ao abrir VS Code', details: errorMsg });
    }
  });

  // POST /api/system/open-explorer (abre a pasta no explorador de arquivos nativo)
  fastify.post<{ Body: { path?: string } }>('/open-explorer', async (request, reply) => {
    const targetPath = request.body?.path?.trim();
    if (!targetPath) {
      return reply.status(400).send({ error: 'Caminho é obrigatório' });
    }

    if (!fs.existsSync(targetPath)) {
      return reply.status(404).send({ error: 'Caminho não encontrado no disco' });
    }

    try {
      const normalizedPath = path.normalize(targetPath);
      if (os.platform() === 'win32') {
        execFile('explorer.exe', [normalizedPath], { windowsHide: false }, (err) => {
          if (err && (err as { code?: number }).code !== 1) {
            console.error('[System] Erro ao disparar Explorer:', err.message);
          }
        });
      } else if (os.platform() === 'darwin') {
        execFile('open', [normalizedPath]);
      } else {
        execFile('xdg-open', [normalizedPath]);
      }
      return reply.send({ success: true, message: 'Explorador de arquivos aberto com sucesso' });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: 'Falha ao abrir explorador de arquivos', details: errorMsg });
    }
  });
};

