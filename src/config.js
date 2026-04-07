/**
 * MAGI Code — Configuration
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const DEFAULT_API_URL = process.env.MAGI_API_URL || 'http://127.0.0.1:3005/v1/chat/completions';
const DEFAULT_MODEL = 'magi-auto';

const PROJECT_MARKERS = [
  'package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod',
  'Gemfile', 'pom.xml', 'build.gradle', 'CMakeLists.txt',
  'Makefile', '.git', 'requirements.txt', 'setup.py',
  'tsconfig.json', 'deno.json', 'composer.json'
];

const DEFAULT_IGNORE = [
  'node_modules', '.git', '.magi', 'dist', 'build', '.next',
  '__pycache__', '.venv', 'venv', 'target', '.DS_Store',
  '*.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.env', '.env.*', 'coverage', '.nyc_output', '.cache'
];

const AGENTS = {
  rafael: { name: 'Rafael', emoji: '🧭', role: 'The Architect', color: '#FF6B35' },
  uriel:  { name: 'Uriel',  emoji: '🔥', role: 'The Validator', color: '#FF4444' },
  michael:{ name: 'Michael',emoji: '🛡️', role: 'The Wise Advisor', color: '#4A90D9' },
  gabriel:{ name: 'Gabriel',emoji: '📣', role: 'The Voice', color: '#FFD700' },
  raguel: { name: 'Raguel', emoji: '🤝', role: 'The Friend', color: '#50C878' },
  magi:   { name: 'MAGI',   emoji: '🐱', role: 'Coding Agent', color: '#C084FC' },
};

export function loadConfig() {
  const projectDir = findProjectRoot(process.cwd());
  const magiDir = path.join(projectDir, '.magi');
  const configPath = path.join(magiDir, 'config.json');
  const globalConfigPath = path.join(os.homedir(), '.magi', 'config.json');

  // Ensure .magi directory exists
  if (!fs.existsSync(magiDir)) {
    fs.mkdirSync(magiDir, { recursive: true });
  }
  if (!fs.existsSync(path.join(magiDir, 'sessions'))) {
    fs.mkdirSync(path.join(magiDir, 'sessions'), { recursive: true });
  }

  let fileConfig = {};
  // Try local config first, then global
  for (const cfgPath of [configPath, globalConfigPath]) {
    if (fs.existsSync(cfgPath)) {
      try {
        fileConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        break;
      } catch { /* ignore bad config */ }
    }
  }

  const config = {
    apiUrl: process.env.MAGI_API_URL || fileConfig.apiUrl || DEFAULT_API_URL,
    apiKey: process.env.MAGI_API_KEY || process.env.MAGI_API_KEY || fileConfig.apiKey || '',
    model: process.env.MAGI_MODEL || fileConfig.model || DEFAULT_MODEL,
    agent: fileConfig.agent || 'magi',
    projectDir,
    magiDir,
    userName: (() => { try { return execSync('git config user.name', {encoding:'utf8'}).trim() || process.env.USER || 'User'; } catch { return process.env.USER || 'User'; } })(),
    projectType: detectProjectType(projectDir),
    ignorePatterns: loadIgnorePatterns(projectDir),
    agents: AGENTS,
    maxContextTokens: 100000,
  };

  return config;
}

function findProjectRoot(dir) {
  let current = dir;
  while (current !== path.dirname(current)) {
    for (const marker of PROJECT_MARKERS) {
      if (fs.existsSync(path.join(current, marker))) {
        return current;
      }
    }
    current = path.dirname(current);
  }
  return dir; // fallback to cwd
}

function detectProjectType(dir) {
  const checks = [
    ['package.json', 'node'],
    ['Cargo.toml', 'rust'],
    ['pyproject.toml', 'python'],
    ['go.mod', 'go'],
    ['Gemfile', 'ruby'],
    ['pom.xml', 'java'],
    ['build.gradle', 'java'],
    ['CMakeLists.txt', 'cpp'],
    ['tsconfig.json', 'typescript'],
    ['deno.json', 'deno'],
    ['composer.json', 'php'],
    ['requirements.txt', 'python'],
    ['setup.py', 'python'],
  ];
  for (const [file, type] of checks) {
    if (fs.existsSync(path.join(dir, file))) return type;
  }
  return 'unknown';
}

function loadIgnorePatterns(dir) {
  const patterns = [...DEFAULT_IGNORE];
  
  // Load .gitignore
  const gitignore = path.join(dir, '.gitignore');
  if (fs.existsSync(gitignore)) {
    const lines = fs.readFileSync(gitignore, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        patterns.push(trimmed);
      }
    }
  }

  // Load .magiignore
  const magiignore = path.join(dir, '.magiignore');
  if (fs.existsSync(magiignore)) {
    const lines = fs.readFileSync(magiignore, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        patterns.push(trimmed);
      }
    }
  }

  return [...new Set(patterns)];
}

export function getSystemPrompt(config) {
  const agentInfo = config.agents[config.agent] || config.agents.magi;
  return `You are ${agentInfo.name} (${agentInfo.emoji} ${agentInfo.role}), an AI coding agent running in the user's terminal via MAGI Code. You have access to their codebase and can read files, edit code, run commands, and search the project.

Project: ${config.projectDir}
Project type: ${config.projectType}

Available tools (use XML format):
<tool_call name="read_file"><param name="path">filepath</param></tool_call>
<tool_call name="write_file"><param name="path">filepath</param><param name="content">file content</param></tool_call>
<tool_call name="edit_file"><param name="path">filepath</param><param name="old_text">text to find</param><param name="new_text">replacement text</param></tool_call>
<tool_call name="run_command"><param name="command">shell command</param></tool_call>
<tool_call name="search_files"><param name="query">search term</param><param name="path">optional directory</param></tool_call>
<tool_call name="list_files"><param name="path">directory path</param></tool_call>

Rules:
- Always read files before editing them
- Show reasoning before changes
- Ask confirmation before destructive actions
- Use edit_file for surgical changes, write_file for new files
- CAVEMAN MODE: Drop articles, filler, pleasantries. Short synonyms. No hedging. Fragments OK. Technical terms exact. Code blocks unchanged. Be concise — few words, full substance.
- When showing code changes, explain what and why — briefly`;
}
