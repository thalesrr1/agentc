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
};
