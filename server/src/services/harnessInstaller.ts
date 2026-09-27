import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type HarnessType = 'antigravity' | 'opencode' | 'claude' | 'cursor' | 'cline';
export type InstallTarget = 'mcp' | 'skill' | 'both';
export type InstallScope = 'project' | 'global';

export interface HarnessIntegrationInfo {
  mcpInstalledGlobal: boolean;
  mcpInstalledProject: boolean;
  skillInstalledGlobal: boolean;
  skillInstalledProject: boolean;
  mcpConfigPath: string;
  skillPath: string;
}

export interface HarnessStatus {
  antigravity: HarnessIntegrationInfo;
  opencode: HarnessIntegrationInfo;
  claude: HarnessIntegrationInfo;
  cursor: HarnessIntegrationInfo;
  cline: HarnessIntegrationInfo;
  paths: {
    mcpCliPath: string;
    dbPath: string;
  };
}

/**
 * Localiza a raiz do repositório AgentC
 */
export function getAgentcRoot(): string {
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..', '..', '..'),
    'D:\\PROJETOS\\agentc',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, '.agent', 'skills', 'agentc', 'SKILL.md'))) {
      return candidate;
    }
  }

  return process.cwd();
}

/**
 * Caminho absoluto para o CLI stdio do MCP
 */
export function getMcpCliPath(): string {
  const root = getAgentcRoot();
  return path.normalize(path.join(root, 'server', 'dist', 'mcp', 'cli.js'));
}

/**
 * Caminho absoluto para o banco de dados do AgentC
 */
export function getDbPath(): string {
  return CONFIG.DB_PATH;
}

/**
 * Localiza a pasta de configurações de usuário do VS Code
 */
export function getVsCodeUserDir(): string {
  if (os.platform() === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'Code',
      'User'
    );
  } else if (os.platform() === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User');
  } else {
    return path.join(os.homedir(), '.config', 'Code', 'User');
  }
}

/**
 * Retorna os caminhos de armazenamento do Cline, Roo Code e Kilo Code
 */
export function getClineStoragePaths(): {
  kilo: string;
  roo: string;
  cline: string;
  codeMcp: string;
} {
  const userDir = getVsCodeUserDir();
  return {
    kilo: path.join(userDir, 'globalStorage', 'kilocode.kilo-code', 'settings', 'cline_mcp_settings.json'),
    roo: path.join(userDir, 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'cline_mcp_settings.json'),
    cline: path.join(userDir, 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
    codeMcp: path.join(userDir, 'mcp.json'),
  };
}

/**
 * Lê o conteúdo canônico da Skill do AgentC
 */
export function getCanonicalSkillContent(): string {
  const root = getAgentcRoot();
  const skillFile = path.join(root, '.agent', 'skills', 'agentc', 'SKILL.md');
  if (fs.existsSync(skillFile)) {
    return fs.readFileSync(skillFile, 'utf8');
  }

  return `---
name: agentc
description: Orchestrates features and tasks using AgentC Kanban and autonomous workers.
---

# AgentC Orchestration Protocol
Decompose tasks into coherent units, register them via AgentC MCP tools and delegate execution.
`;
}

function readJsonSafe(filePath: string): any {
  try {
    if (!fs.existsSync(filePath)) return {};
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (!content) return {};
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function writeJsonSafe(filePath: string, data: any): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function writeSkillFile(destPath: string, customContent?: string): void {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = customContent || getCanonicalSkillContent();
  fs.writeFileSync(destPath, content, 'utf8');
}

/**
 * Retorna o status de instalação de todos os harnesses
 */
export function getHarnessStatus(projectPath?: string): HarnessStatus {
  const home = os.homedir();
  const mcpCli = getMcpCliPath();
  const db = getDbPath();

  // 1. Antigravity
  const agyGlobalConfig = path.join(home, '.gemini', 'config', 'mcp_config.json');
  const agyGlobalSkill = path.join(home, '.gemini', 'config', 'skills', 'agentc', 'SKILL.md');
  const agyProjectConfig = projectPath ? path.join(projectPath, '.gemini', 'mcp_config.json') : '';
  const agyProjectSkill = projectPath ? path.join(projectPath, '.agent', 'skills', 'agentc', 'SKILL.md') : '';

  const agyGlobalJson = readJsonSafe(agyGlobalConfig);
  const agyProjectJson = agyProjectConfig ? readJsonSafe(agyProjectConfig) : {};

  // 2. OpenCode
  const opencodeGlobalConfig = path.join(home, '.config', 'opencode', 'opencode.json');
  const opencodeGlobalSkill = path.join(home, '.config', 'opencode', 'skills', 'agentc', 'SKILL.md');
  const opencodeProjectConfig = projectPath ? path.join(projectPath, 'opencode.json') : '';
  const opencodeProjectSkill = projectPath ? path.join(projectPath, '.agent', 'skills', 'agentc', 'SKILL.md') : '';

  const opencodeGlobalJson = readJsonSafe(opencodeGlobalConfig);
  const opencodeProjectJson = opencodeProjectConfig ? readJsonSafe(opencodeProjectConfig) : {};

  // 3. Claude Code
  const claudeGlobalConfig = path.join(home, '.claude.json');
  const claudeProjectConfig = projectPath ? path.join(projectPath, '.claude.json') : '';
  const claudeProjectSkill = projectPath ? path.join(projectPath, 'CLAUDE.md') : '';

  const claudeGlobalJson = readJsonSafe(claudeGlobalConfig);
  const claudeProjectJson = claudeProjectConfig ? readJsonSafe(claudeProjectConfig) : {};

  // 4. Cursor
  const cursorGlobalConfig = path.join(home, '.cursor', 'mcp.json');
  const cursorProjectConfig = projectPath ? path.join(projectPath, '.cursor', 'mcp.json') : '';
  const cursorGlobalSkill = path.join(home, '.cursor', 'rules', 'agentc.mdc');
  const cursorProjectSkill = projectPath ? path.join(projectPath, '.cursor', 'rules', 'agentc.mdc') : '';
  const cursorProjectRulesLegacy = projectPath ? path.join(projectPath, '.cursorrules') : '';

  const cursorGlobalJson = readJsonSafe(cursorGlobalConfig);
  const cursorProjectJson = cursorProjectConfig ? readJsonSafe(cursorProjectConfig) : {};

  // 5. Cline / Roo Code / Kilo Code
  const clinePaths = getClineStoragePaths();
  const kiloJson = readJsonSafe(clinePaths.kilo);
  const rooJson = readJsonSafe(clinePaths.roo);
  const clineJson = readJsonSafe(clinePaths.cline);
  const codeMcpJson = readJsonSafe(clinePaths.codeMcp);

  const clineGlobalMcpInstalled = Boolean(
    kiloJson?.mcpServers?.agentc ||
    rooJson?.mcpServers?.agentc ||
    clineJson?.mcpServers?.agentc ||
    codeMcpJson?.servers?.agentc ||
    codeMcpJson?.mcpServers?.agentc
  );

  const clineProjectConfig = projectPath ? path.join(projectPath, '.vscode', 'mcp.json') : '';
  const clineProjectAltConfig = projectPath ? path.join(projectPath, '.cline', 'mcp_settings.json') : '';
  const clineProjectJson = clineProjectConfig ? readJsonSafe(clineProjectConfig) : {};
  const clineProjectAltJson = clineProjectAltConfig ? readJsonSafe(clineProjectAltConfig) : {};
  const clineProjectMcpInstalled = Boolean(
    clineProjectJson?.mcpServers?.agentc ||
    clineProjectJson?.servers?.agentc ||
    clineProjectAltJson?.mcpServers?.agentc
  );

  const clineGlobalSkill = path.join(home, '.clinerules');
  const clineProjectSkill = projectPath ? path.join(projectPath, '.clinerules') : '';
  const kiloProjectSkill = projectPath ? path.join(projectPath, '.kilorules') : '';
  const agentSkillPath = projectPath ? path.join(projectPath, '.agent', 'skills', 'agentc', 'SKILL.md') : '';

  // Determinar o melhor path de exibição para a família Cline/Kilo
  let activeClineConfigDisplay = clinePaths.kilo;
  if (fs.existsSync(path.dirname(clinePaths.kilo))) {
    activeClineConfigDisplay = clinePaths.kilo;
  } else if (fs.existsSync(path.dirname(clinePaths.roo))) {
    activeClineConfigDisplay = clinePaths.roo;
  } else if (fs.existsSync(path.dirname(clinePaths.cline))) {
    activeClineConfigDisplay = clinePaths.cline;
  } else {
    activeClineConfigDisplay = clinePaths.codeMcp;
  }

  return {
    antigravity: {
      mcpInstalledGlobal: Boolean(agyGlobalJson?.mcpServers?.agentc),
      mcpInstalledProject: Boolean(agyProjectJson?.mcpServers?.agentc),
      skillInstalledGlobal: fs.existsSync(agyGlobalSkill),
      skillInstalledProject: Boolean(agyProjectSkill && fs.existsSync(agyProjectSkill)),
      mcpConfigPath: agyGlobalConfig,
      skillPath: agyGlobalSkill,
    },
    opencode: {
      mcpInstalledGlobal: Boolean(opencodeGlobalJson?.mcp?.agentc),
      mcpInstalledProject: Boolean(opencodeProjectJson?.mcp?.agentc),
      skillInstalledGlobal: fs.existsSync(opencodeGlobalSkill),
      skillInstalledProject: Boolean(opencodeProjectSkill && fs.existsSync(opencodeProjectSkill)),
      mcpConfigPath: opencodeGlobalConfig,
      skillPath: opencodeGlobalSkill,
    },
    claude: {
      mcpInstalledGlobal: Boolean(claudeGlobalJson?.mcpServers?.agentc),
      mcpInstalledProject: Boolean(claudeProjectJson?.mcpServers?.agentc),
      skillInstalledGlobal: false,
      skillInstalledProject: Boolean(claudeProjectSkill && fs.existsSync(claudeProjectSkill)),
      mcpConfigPath: claudeGlobalConfig,
      skillPath: claudeProjectSkill,
    },
    cursor: {
      mcpInstalledGlobal: Boolean(cursorGlobalJson?.mcpServers?.agentc),
      mcpInstalledProject: Boolean(cursorProjectJson?.mcpServers?.agentc),
      skillInstalledGlobal: fs.existsSync(cursorGlobalSkill),
      skillInstalledProject: Boolean(
        (cursorProjectSkill && fs.existsSync(cursorProjectSkill)) ||
        (cursorProjectRulesLegacy && fs.existsSync(cursorProjectRulesLegacy))
      ),
      mcpConfigPath: cursorGlobalConfig,
      skillPath: cursorProjectSkill || cursorProjectRulesLegacy,
    },
    cline: {
      mcpInstalledGlobal: clineGlobalMcpInstalled,
      mcpInstalledProject: clineProjectMcpInstalled,
      skillInstalledGlobal: fs.existsSync(clineGlobalSkill) || fs.existsSync(path.join(home, '.kilorules')),
      skillInstalledProject: Boolean(
        (clineProjectSkill && fs.existsSync(clineProjectSkill)) ||
        (kiloProjectSkill && fs.existsSync(kiloProjectSkill)) ||
        (agentSkillPath && fs.existsSync(agentSkillPath))
      ),
      mcpConfigPath: activeClineConfigDisplay,
      skillPath: clineProjectSkill || kiloProjectSkill,
    },
    paths: {
      mcpCliPath: mcpCli,
      dbPath: db,
    },
  };
}

/**
 * Instala o MCP e/ou a Skill para o harness solicitado
 */
export function installHarness(params: {
  harness: HarnessType;
  target: InstallTarget;
  scope: InstallScope;
  projectPath?: string;
}): { success: boolean; message: string; details?: any } {
  const { harness, target, scope, projectPath } = params;
  const home = os.homedir();
  const mcpCli = getMcpCliPath();
  const db = getDbPath();

  if (scope === 'project' && !projectPath) {
    throw new Error('Caminho do projeto não especificado para instalação de escopo local');
  }

  const results: string[] = [];

  const autoApproveTools = [
    'agentc_list_projects',
    'agentc_register_project',
    'agentc_create_plan',
    'agentc_get_board',
    'agentc_start_task',
    'agentc_get_task_outcome',
    'agentc_update_task_status',
    'agentc_cancel_task',
    'agentc_start_feature',
    'agentc_get_feature_status',
    'agentc_pause_feature',
    'agentc_resume_feature',
  ];

  // ================= 1. ANTIGRAVITY =================
  if (harness === 'antigravity') {
    const agyConfigPath =
      scope === 'global'
        ? path.join(home, '.gemini', 'config', 'mcp_config.json')
        : path.join(projectPath!, '.gemini', 'mcp_config.json');

    const agySkillPath =
      scope === 'global'
        ? path.join(home, '.gemini', 'config', 'skills', 'agentc', 'SKILL.md')
        : path.join(projectPath!, '.agent', 'skills', 'agentc', 'SKILL.md');

    if (target === 'mcp' || target === 'both') {
      const config = readJsonSafe(agyConfigPath);
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.agentc = {
        command: 'node',
        args: [mcpCli],
        env: { AGENTC_DB_PATH: db },
        autoApprove: autoApproveTools,
      };
      writeJsonSafe(agyConfigPath, config);
      results.push(`MCP configurado em ${agyConfigPath}`);
    }

    if (target === 'skill' || target === 'both') {
      writeSkillFile(agySkillPath);
      results.push(`Skill copiada para ${agySkillPath}`);
    }
  }

  // ================= 2. OPENCODE =================
  else if (harness === 'opencode') {
    const opencodeConfigPath =
      scope === 'global'
        ? path.join(home, '.config', 'opencode', 'opencode.json')
        : path.join(projectPath!, 'opencode.json');

    const opencodeSkillPath =
      scope === 'global'
        ? path.join(home, '.config', 'opencode', 'skills', 'agentc', 'SKILL.md')
        : path.join(projectPath!, '.agent', 'skills', 'agentc', 'SKILL.md');

    if (target === 'mcp' || target === 'both') {
      const config = readJsonSafe(opencodeConfigPath);
      if (!config.$schema) {
        config.$schema = 'https://opencode.ai/config.json';
      }
      config.mcp = config.mcp || {};
      config.mcp.agentc = {
        type: 'local',
        command: ['node', mcpCli],
        environment: { AGENTC_DB_PATH: db },
      };
      writeJsonSafe(opencodeConfigPath, config);
      results.push(`MCP configurado em ${opencodeConfigPath}`);
    }

    if (target === 'skill' || target === 'both') {
      writeSkillFile(opencodeSkillPath);
      results.push(`Skill copiada para ${opencodeSkillPath}`);
    }
  }

  // ================= 3. CLAUDE CODE =================
  else if (harness === 'claude') {
    const claudeConfigPath =
      scope === 'global'
        ? path.join(home, '.claude.json')
        : path.join(projectPath!, '.claude.json');

    const claudeMdPath = projectPath ? path.join(projectPath, 'CLAUDE.md') : '';
    const claudeSkillPath = projectPath ? path.join(projectPath, '.agent', 'skills', 'agentc', 'SKILL.md') : '';

    if (target === 'mcp' || target === 'both') {
      const config = readJsonSafe(claudeConfigPath);
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.agentc = {
        command: 'node',
        args: [mcpCli],
        env: { AGENTC_DB_PATH: db },
      };
      writeJsonSafe(claudeConfigPath, config);
      results.push(`MCP configurado em ${claudeConfigPath}`);
    }

    if (target === 'skill' || target === 'both') {
      if (claudeSkillPath) {
        writeSkillFile(claudeSkillPath);
        results.push(`Skill copiada para ${claudeSkillPath}`);
      }

      if (claudeMdPath) {
        let claudeMdContent = '';
        if (fs.existsSync(claudeMdPath)) {
          claudeMdContent = fs.readFileSync(claudeMdPath, 'utf8');
        }

        const agentcBlock = `\n<!-- AGENTC:START -->\n## AgentC Orchestration\nEste projeto utiliza o AgentC para planejamento visual e esteiras autônomas de tarefas.\nUtilize as ferramentas \`agentc_*\` do MCP para criar planos (\`agentc_create_plan\`), iniciar tarefas (\`agentc_start_task\`) e acompanhar esteiras (\`agentc_start_feature\`).\nProtocolo completo de orquestração: \`.agent/skills/agentc/SKILL.md\`\n<!-- AGENTC:END -->\n`;

        if (!claudeMdContent.includes('<!-- AGENTC:START -->')) {
          claudeMdContent = `${claudeMdContent.trim()}\n${agentcBlock}`;
        } else {
          claudeMdContent = claudeMdContent.replace(
            /<!-- AGENTC:START -->[\s\S]*?<!-- AGENTC:END -->/,
            agentcBlock.trim()
          );
        }

        fs.writeFileSync(claudeMdPath, claudeMdContent, 'utf8');
        results.push(`Instruções atualizadas em ${claudeMdPath}`);
      }
    }
  }

  // ================= 4. CURSOR =================
  else if (harness === 'cursor') {
    const cursorConfigPath =
      scope === 'global'
        ? path.join(home, '.cursor', 'mcp.json')
        : path.join(projectPath!, '.cursor', 'mcp.json');

    const cursorMdcPath =
      scope === 'global'
        ? path.join(home, '.cursor', 'rules', 'agentc.mdc')
        : path.join(projectPath!, '.cursor', 'rules', 'agentc.mdc');

    const cursorRulesLegacy = projectPath ? path.join(projectPath, '.cursorrules') : '';

    if (target === 'mcp' || target === 'both') {
      const config = readJsonSafe(cursorConfigPath);
      config.mcpServers = config.mcpServers || {};
      config.mcpServers.agentc = {
        command: 'node',
        args: [mcpCli],
        env: { AGENTC_DB_PATH: db },
      };
      writeJsonSafe(cursorConfigPath, config);
      results.push(`MCP configurado em ${cursorConfigPath}`);
    }

    if (target === 'skill' || target === 'both') {
      const mdcContent = `---
description: Protocolo de orquestração de tarefas e features com AgentC
globs: *
alwaysApply: false
---

${getCanonicalSkillContent()}
`;
      writeSkillFile(cursorMdcPath, mdcContent);
      results.push(`Regra Cursor 2.0 criada em ${cursorMdcPath}`);

      if (cursorRulesLegacy) {
        writeSkillFile(cursorRulesLegacy);
        results.push(`.cursorrules sincronizado em ${cursorRulesLegacy}`);
      }
    }
  }

  // ================= 5. CLINE / ROO CODE / KILO CODE =================
  else if (harness === 'cline') {
    const clinePaths = getClineStoragePaths();
    const userDir = getVsCodeUserDir();

    if (target === 'mcp' || target === 'both') {
      const mcpEntry = {
        command: 'node',
        args: [mcpCli],
        env: { AGENTC_DB_PATH: db },
        alwaysAllow: autoApproveTools,
        disabled: false,
      };

      if (scope === 'global') {
        // Se a pasta do Kilo Code existir em globalStorage (ou por padrão)
        if (fs.existsSync(path.join(userDir, 'globalStorage', 'kilocode.kilo-code'))) {

          const kiloCfg = readJsonSafe(clinePaths.kilo);
          kiloCfg.mcpServers = kiloCfg.mcpServers || {};
          kiloCfg.mcpServers.agentc = mcpEntry;
          writeJsonSafe(clinePaths.kilo, kiloCfg);
          results.push(`MCP Kilo Code configurado em ${clinePaths.kilo}`);
        }

        // Se a pasta do Roo Code existir
        if (fs.existsSync(path.join(userDir, 'globalStorage', 'rooveterinaryinc.roo-cline'))) {
          const rooCfg = readJsonSafe(clinePaths.roo);
          rooCfg.mcpServers = rooCfg.mcpServers || {};
          rooCfg.mcpServers.agentc = mcpEntry;
          writeJsonSafe(clinePaths.roo, rooCfg);
          results.push(`MCP Roo Code configurado em ${clinePaths.roo}`);
        }

        // Se a pasta do Cline original existir
        if (fs.existsSync(path.join(userDir, 'globalStorage', 'saoudrizwan.claude-dev'))) {
          const clineCfg = readJsonSafe(clinePaths.cline);
          clineCfg.mcpServers = clineCfg.mcpServers || {};
          clineCfg.mcpServers.agentc = mcpEntry;
          writeJsonSafe(clinePaths.cline, clineCfg);
          results.push(`MCP Cline configurado em ${clinePaths.cline}`);
        }

        // Também assegura em Code/User/mcp.json ou default kilo
        const codeMcpCfg = readJsonSafe(clinePaths.codeMcp);
        if (codeMcpCfg.servers || !fs.existsSync(clinePaths.kilo)) {
          codeMcpCfg.servers = codeMcpCfg.servers || {};
          codeMcpCfg.servers.agentc = mcpEntry;
          writeJsonSafe(clinePaths.codeMcp, codeMcpCfg);
          results.push(`MCP configurado em ${clinePaths.codeMcp}`);
        }
      } else {
        // No Projeto Atual: escreve em .vscode/mcp.json e .cline/mcp_settings.json
        const vsCodeMcpPath = path.join(projectPath!, '.vscode', 'mcp.json');
        const clineProjMcpPath = path.join(projectPath!, '.cline', 'mcp_settings.json');

        const vsCfg = readJsonSafe(vsCodeMcpPath);
        vsCfg.mcpServers = vsCfg.mcpServers || {};
        vsCfg.mcpServers.agentc = mcpEntry;
        writeJsonSafe(vsCodeMcpPath, vsCfg);

        const clineCfg = readJsonSafe(clineProjMcpPath);
        clineCfg.mcpServers = clineCfg.mcpServers || {};
        clineCfg.mcpServers.agentc = mcpEntry;
        writeJsonSafe(clineProjMcpPath, clineCfg);

        results.push(`MCP configurado em ${vsCodeMcpPath}`);
      }
    }

    if (target === 'skill' || target === 'both') {
      const canonicalContent = getCanonicalSkillContent();

      if (scope === 'global') {
        const globalClineRules = path.join(home, '.clinerules');
        const globalKiloRules = path.join(home, '.kilorules');
        writeSkillFile(globalClineRules, canonicalContent);
        writeSkillFile(globalKiloRules, canonicalContent);
        results.push(`.clinerules e .kilorules globais criados em ${home}`);
      } else {
        const projClineRules = path.join(projectPath!, '.clinerules');
        const projKiloRules = path.join(projectPath!, '.kilorules');
        const projSkillDir = path.join(projectPath!, '.agent', 'skills', 'agentc', 'SKILL.md');

        writeSkillFile(projClineRules, canonicalContent);
        writeSkillFile(projKiloRules, canonicalContent);
        writeSkillFile(projSkillDir, canonicalContent);
        results.push(`.clinerules e .kilorules configurados no projeto`);
      }
    }
  }

  return {
    success: true,
    message: `Instalação concluída com sucesso para ${harness} (${scope}).`,
    details: results,
  };
}
