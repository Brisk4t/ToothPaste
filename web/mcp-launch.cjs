// Launcher for VS Code MCP server integration.
// Uses require('electron') to resolve the actual Electron binary path,
// then spawns it directly with stdio inherited so the MCP JSON-RPC
// channel is clean (no npm banner pollution on stdout).
const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');

const child = spawn(
  electron,
  [path.join(__dirname, 'out', 'main', 'main.js'), '--mcp'],
  { stdio: 'inherit' }
);

child.on('close', (code) => process.exit(code ?? 0));
