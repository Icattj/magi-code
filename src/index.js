#!/usr/bin/env node
/**
 * MAGI Code — AI Coding Agent
 * Terminal UI inspired by Gemini CLI
 */
import readline from 'readline';
import { loadConfig } from './config.js';
import { SessionManager } from './session.js';
import { ContextBuilder } from './context.js';
import { sendMessage } from './agent.js';
import { performUndo } from './tools.js';
import {
  renderWelcome, renderHelp, renderAgentList,
  renderContext, renderError, getPromptString, colors,
} from './ui.js';

// ─── Globals ─────────────────────────────────────────────────
let config;
let session;
let context;
let rl;
let isProcessing = false;
let abortSignal = { aborted: false };

// ─── Parse CLI Args ──────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { agent: null, resume: false };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--version': case '-v':
        console.log('magi-code v1.0.0');
        process.exit(0);
        break;
      case '--help': case '-h':
        printUsage();
        process.exit(0);
        break;
      case '--agent': case '-a':
        opts.agent = args[++i];
        break;
      case '--resume': case '-r':
        opts.resume = true;
        break;
    }
  }
  return opts;
}

function printUsage() {
  console.log(`
  MAGI Code — AI coding agent v1.0.0

  Usage: magi [options]

  Options:
    --agent, -a <name>   Start with a specific agent
    --resume, -r         Resume last session
    --version, -v        Show version
    --help, -h           Show this help

  Environment:
    MAGI_API_KEY         API key (default: sk-sentra-magi-2026)
    MAGI_MODEL           Model (default: magi-auto)
    MAGI_API_URL         API endpoint (default: http://127.0.0.1:3005/v1/chat/completions)
`);
}

// ─── Input Loop ──────────────────────────────────────────────
function startInputLoop() {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: getPromptString(),
    historySize: 100,
    terminal: true,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    if (input.startsWith('/')) {
      await handleCommand(input);
    } else {
      await handleMessage(input);
    }
  });

  rl.on('close', () => {
    console.log(colors.dim('\n  Goodbye! 🐱\n'));
    if (session) session.save();
    process.exit(0);
  });

  // Ctrl+C: cancel current stream or hint to exit
  rl.on('SIGINT', () => {
    if (isProcessing) {
      abortSignal.aborted = true;
      console.log(colors.warning('\n  Cancelled.'));
      isProcessing = false;
      rl.prompt();
    } else {
      console.log(colors.dim('\n  Press Ctrl+D to exit, or type /exit'));
      rl.prompt();
    }
  });
}

// ─── Command Handler ─────────────────────────────────────────
async function handleCommand(input) {
  const parts = input.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  switch (cmd) {
    case '/help':
      renderHelp();
      break;

    case '/agent':
      if (!args) {
        console.log(colors.warning('  Usage: /agent <name>'));
        console.log(colors.dim('  Use /agents to see available agents'));
      } else {
        const agentId = args.toLowerCase();
        if (config.agents[agentId]) {
          config.agent = agentId;
          const a = config.agents[agentId];
          console.log(colors.success(`\n  Switched to ${a.emoji} ${a.name} — ${a.role}\n`));
        } else {
          console.log(colors.error(`  Unknown agent: ${args}`));
          console.log(colors.dim('  Use /agents to see available agents'));
        }
      }
      break;

    case '/agents':
      renderAgentList(config.agents, config.agent);
      break;

    case '/context':
      renderContext(session.getContextFiles(), session.estimateTokens());
      break;

    case '/undo': {
      const result = performUndo();
      if (result) {
        console.log(colors.success(`\n  Undo: ${result.path} — ${result.action}\n`));
      } else {
        console.log(colors.warning('\n  Nothing to undo.\n'));
      }
      break;
    }

    case '/clear': {
      const count = session.clear();
      console.log(colors.success(`\n  Cleared ${count} messages.\n`));
      break;
    }

    case '/compact': {
      const compacted = session.compact();
      if (compacted > 0) {
        console.log(colors.success(`\n  Compacted ${compacted} messages.\n`));
      } else {
        console.log(colors.dim('\n  Not enough messages to compact.\n'));
      }
      break;
    }

    case '/resume': {
      const resumed = session.resume();
      if (resumed) {
        console.log(colors.success(`\n  Resumed session from ${resumed.startedAt}`));
        console.log(colors.dim(`  ${session.messages.length} messages loaded\n`));
      } else {
        console.log(colors.warning('\n  No previous session found.\n'));
      }
      break;
    }

    case '/exit':
      session.save();
      console.log(colors.dim('\n  Session saved. Goodbye! 🐱\n'));
      process.exit(0);
      break;

    default:
      console.log(colors.warning(`  Unknown command: ${cmd}`));
      console.log(colors.dim('  Type /help for available commands'));
  }

  rl.prompt();
}

// ─── Message Handler ─────────────────────────────────────────
async function handleMessage(input) {
  isProcessing = true;
  abortSignal = { aborted: false };

  try {
    await sendMessage(config, session, input, {
      onToolConfirm: (summary) => {
        return new Promise((resolve) => {
          rl.question(
            '  ' + colors.dim('└ ') + colors.warning(`Allow ${summary}? `) + colors.dim('[Y/n] '),
            (answer) => {
              const a = answer.trim().toLowerCase();
              resolve(a === '' || a === 'y' || a === 'yes');
            }
          );
        });
      },
      abortSignal,
    });
  } catch (err) {
    renderError(err.message);
  }

  isProcessing = false;
  console.log();
  rl.prompt();
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();

  // Load configuration
  config = loadConfig();

  // Override agent from CLI
  if (opts.agent) {
    const agentId = opts.agent.toLowerCase();
    if (config.agents[agentId]) {
      config.agent = agentId;
    } else {
      console.log(colors.warning(`Unknown agent: ${opts.agent}, using default`));
    }
  }

  // Initialize session
  session = new SessionManager(config.magiDir);
  if (opts.resume) {
    if (!session.resume()) session.newSession();
  } else {
    session.newSession();
  }

  // Initialize context
  context = new ContextBuilder(config.projectDir, config.ignorePatterns);

  // Check for API key
  renderWelcome(config);
  if (!config.apiKey) {
    console.log(colors.warning('  ⚠️  No API key configured!'));
    console.log(colors.dim('  Set: export MAGI_API_KEY=your-key\n'));
  }

  // Start input loop
  startInputLoop();
}

// ─── Run ─────────────────────────────────────────────────────
main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
