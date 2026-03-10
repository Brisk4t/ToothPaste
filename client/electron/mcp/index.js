import { createServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { typeTextTool } from './tools/typeText.js';
import { pressKeyTool } from './tools/pressKey.js';
import { mouseMoveTool, mouseClickTool, mouseScrollTool } from './tools/mouse.js';
import { mediaControlTool } from './tools/mediaControl.js';
import { getStatusTool } from './tools/getStatus.js';
import { connectTool, disconnectTool } from './tools/connect.js';

import { readSerialTool } from './tools/readSerial.js';

export const MCP_PORT = 27831;

/**
 * Creates and wires the MCP Server instance with all tools.
 * @param {Function} ipcDispatch
 */
function createMCPServer(ipcDispatch) {
  const server = new Server(
    { name: 'toothpaste-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  const tools = [
    typeTextTool,
    pressKeyTool,
    mouseMoveTool,
    mouseClickTool,
    mouseScrollTool,
    mediaControlTool,
    getStatusTool,
    connectTool,
    disconnectTool,
    readSerialTool
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: params } = request.params;
    const tool = tools.find(t => t.name === name);

    if (!tool) {
      return { content: [{ type: 'text', text: `Tool "${name}" not found` }], isError: true };
    }

    try {
      const result = await tool.execute(params, ipcDispatch);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Error executing "${name}": ${error.message}` }], isError: true };
    }
  });

  return server;
}

/**
 * Start the MCP HTTP server on MCP_PORT.
 * Each incoming request gets its own stateless transport instance.
 * VS Code connects to http://localhost:MCP_PORT/mcp
 *
 * @param {Function} ipcDispatch
 * @returns {Promise<http.Server>}
 */
export async function initMCPServer(ipcDispatch) {
  const httpServer = createServer(async (req, res) => {
    if (!req.url?.startsWith('/mcp')) {
      res.writeHead(404).end('Not found');
      return;
    }

    // Fresh Server + transport per request — Server can only connect once
    const server = createMCPServer(ipcDispatch);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  await new Promise((resolve, reject) => {
    httpServer.listen(MCP_PORT, '127.0.0.1', () => {
      console.error(`[MCP] HTTP server listening on http://127.0.0.1:${MCP_PORT}/mcp`);
      resolve();
    });
    httpServer.once('error', reject);
  });

  return httpServer;
}

