#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[AgentC MCP Server] Connected and listening via StdioServerTransport.');
}

main().catch((err) => {
  console.error('[AgentC MCP Server] Fatal error:', err);
  process.exit(1);
});
