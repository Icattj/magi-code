/**
 * MAGI Code — Configuration
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const DEFAULT_API_URL = 'http://127.0.0.1:3005/v1/chat/completions';
const DEFAULT_API_KEY = 'sk-sentra-magi-2026';
const DEFAULT_MODEL = 'magi-auto';

const PROJECT_MARKERS = [
  'package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod',
  'Gemfile', 'pom.xml', 'build.gradle', 'CMakeLists.txt',
  'Makefile', '.git', 'requirements.txt', 'setup.py',
  'tsconfig.json', 'deno.json', 'composer.json',
];

const DEFAULT_IGNORE = [
  'node_modules', '.git', '.magi', 'dist', 'build', '.next',
  '__pycache__', '.venv', 'venv', 'target', '.DS_Store',
  '*.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.env', '.env.*', 'coverage', '.nyc_output', '.cache',
];

const AGENTS = {
  magi:    { name: 'MAGI',    emoji: '🐱', role: 'Coding Agent',     color: '#C084FC' },
  rafael:  { name: 'Rafael',  emoji: '🧭', role: 'The Architect',    color: '#FF6B35' },
  uriel:   { name: 'Uriel',   emoji: '🔥', role: 'The Validator',    color: '#FF4444' },
  michael: { name: 'Michael', emoji: '🛡️', role: 'The Wise Advisor', color: '#4A90D9' },
  gabriel: { name: 'Gabriel', emoji: '📣', role: 'The Voice',        color: '#FFD700' },
  raguel:  { name: 'Raguel',  emoji: '🤝', role: 'The Friend',       color: '#50C878' },
};

export function loadConfig() {
  const projectDir = findProjectRoot(process.cwd());
  const magiDir = path.join(projectDir, '.magi');
  const configPath = path.join(magiDir, 'config.json');
  const globalConfigPath = path.join(os.homedir(), '.magi', 'config.json');

  // Ensure directories exist
  for (const d of [magiDir, path.join(magiDir, 'sessions'), path.join(magiDir, 'backups')]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }

  let fileConfig = {};
  for (const cfgPath of [configPath, globalConfigPath]) {
    if (fs.existsSync(cfgPath)) {
      try { fileConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')); break; }
      catch { /* ignore bad config */ }
    }
  }

  const config = {
    apiUrl:   process.env.MAGI_API_URL || fileConfig.apiUrl || DEFAULT_API_URL,
    apiKey:   process.env.MAGI_API_KEY || fileConfig.apiKey || DEFAULT_API_KEY,
    model:    process.env.MAGI_MODEL   || fileConfig.model  || DEFAULT_MODEL,
    agent:    fileConfig.agent || 'magi',
    projectDir,
    magiDir,
    userName: getUserName(),
    projectType: detectProjectType(projectDir),
    ignorePatterns: loadIgnorePatterns(projectDir),
    agents: AGENTS,
    maxContextTokens: 100000,
  };

  return config;
}

function getUserName() {
  try { return execSync('git config user.name', { encoding: 'utf8' }).trim() || process.env.USER || 'User'; }
  catch { return process.env.USER || 'User'; }
}

function findProjectRoot(dir) {
  let current = dir;
  while (current !== path.dirname(current)) {
    for (const marker of PROJECT_MARKERS) {
      if (fs.existsSync(path.join(current, marker))) return current;
    }
    current = path.dirname(current);
  }
  return dir;
}

function detectProjectType(dir) {
  const checks = [
    ['package.json', 'node'], ['Cargo.toml', 'rust'], ['pyproject.toml', 'python'],
    ['go.mod', 'go'], ['Gemfile', 'ruby'], ['pom.xml', 'java'],
    ['build.gradle', 'java'], ['CMakeLists.txt', 'cpp'], ['tsconfig.json', 'typescript'],
    ['deno.json', 'deno'], ['composer.json', 'php'], ['requirements.txt', 'python'],
    ['setup.py', 'python'],
  ];
  for (const [file, type] of checks) {
    if (fs.existsSync(path.join(dir, file))) return type;
  }
  return 'unknown';
}

function loadIgnorePatterns(dir) {
  const patterns = [...DEFAULT_IGNORE];
  for (const file of ['.gitignore', '.magiignore']) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) patterns.push(trimmed);
      }
    }
  }
  return [...new Set(patterns)];
}

export function getSystemPrompt(config) {
  const a = config.agents[config.agent] || config.agents.magi;
  return `You are ${a.name} (${a.emoji} ${a.role}), an AI coding agent running in the user's terminal via MAGI Code. You have access to their codebase and can read files, edit code, run commands, and search the project.

Project: ${config.projectDir}
Project type: ${config.projectType}

Available tools — use XML format inline in your response:

<tool_call name="read_file"><param name="path">filepath</param></tool_call>
<tool_call name="write_file"><param name="path">filepath</param><param name="content">file content here</param></tool_call>
<tool_call name="edit_file"><param name="path">filepath</param><param name="old_text">exact text to find</param><param name="new_text">replacement text</param></tool_call>
<tool_call name="run_command"><param name="command">shell command</param></tool_call>
<tool_call name="search_files"><param name="query">search term</param><param name="path">optional directory</param></tool_call>
<tool_call name="list_files"><param name="path">directory path</param></tool_call>
<tool_call name="open_url"><param name="url">https://example.com</param></tool_call>
<tool_call name="read_clipboard"></tool_call>
<tool_call name="write_clipboard"><param name="text">text to copy</param></tool_call>
<tool_call name="read_screen"></tool_call>

Server tools (VPS at 64.227.110.70):
<tool_call name="server_exec"><param name="command">shell command on server</param></tool_call>
<tool_call name="server_read"><param name="path">/home/openclaw/file.js</param></tool_call>
<tool_call name="server_write"><param name="path">/home/openclaw/file.js</param><param name="content">file content</param></tool_call>
<tool_call name="server_list"><param name="path">/home/openclaw</param></tool_call>
<tool_call name="server_search"><param name="query">search term</param><param name="path">/home/openclaw/magi-v2</param></tool_call>

Computer control tools (macOS):
<tool_call name="screenshot"></tool_call>
<tool_call name="click"><param name="x">500</param><param name="y">300</param></tool_call>
<tool_call name="type_text"><param name="text">hello world</param></tool_call>
<tool_call name="press_key"><param name="key">cmd+s</param></tool_call>
<tool_call name="open_app"><param name="name">Safari</param></tool_call>
<tool_call name="open_browser"><param name="url">https://example.com</param></tool_call>
<tool_call name="active_window"></tool_call>
<tool_call name="running_apps"></tool_call>
<tool_call name="move_mouse"><param name="x">500</param><param name="y">300</param></tool_call>

LOCAL tools (read_file, write_file, etc) work on the user's computer.
SERVER tools (server_*) work on the VPS. Use server tools when user asks about the server, MAGI, or deployed apps.

Rules:
- Always read files before editing them
- Show reasoning before changes — briefly
- Use edit_file for surgical changes, write_file for new files
- One tool_call per action. You can chain multiple tool_calls.
- After a tool result is returned, continue your response.
- CAVEMAN MODE: Drop articles, filler, pleasantries. Short synonyms. No hedging. Fragments OK. Technical terms exact. Code blocks unchanged. Be concise — few words, full substance.`;
}
