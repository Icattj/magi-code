/**
 * MAGI Code — Terminal UI
 * Clean, Gemini CLI-style output with ┌│└ tool blocks
 */
import chalk from 'chalk';

// ─── Cat Mascot ──────────────────────────────────────────────
const CAT_MASCOT = [
  '    ▄█▀▀▀▄   ▄▀▀▀█▄    ',
  '    █     ▀▀▀▀     █    ',
  '    █               █    ',
  '    █   ▀▀     ▀▀   █    ',
  '    █       ▼       █    ',
  '    █    ▀▀▀▀▀▀▀    █    ',
  '    ▀█▄▄▄▄▄▄▄▄▄▄▄▄█▀    ',
  '      █ █       █ █      ',
  '      ▀ ▀       ▀ ▀      ',
];

// ─── Colors ──────────────────────────────────────────────────
export const colors = {
  primary:   chalk.hex('#89CFF0'),
  secondary: chalk.hex('#60A5FA'),
  success:   chalk.hex('#4ADE80'),
  warning:   chalk.hex('#FBBF24'),
  error:     chalk.hex('#F87171'),
  dim:       chalk.dim,
  bold:      chalk.bold,
  muted:     chalk.gray,
};

// ─── Helpers ─────────────────────────────────────────────────
export function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\].*?\x07/g, '');
}

function center(text) {
  const width = process.stdout.columns || 80;
  const stripped = stripAnsi(text);
  const pad = Math.max(0, Math.floor((width - stripped.length) / 2));
  return ' '.repeat(pad) + text;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function padTo(str, width) {
  const visible = stripAnsi(str).length;
  if (visible >= width) return str;
  return str + ' '.repeat(width - visible);
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

// ─── Welcome Screen ──────────────────────────────────────────
export function renderWelcome(config) {
  const agentInfo = config.agents[config.agent] || config.agents.magi;
  const userName = capitalize(config.userName);

  console.clear();
  console.log();

  for (const line of CAT_MASCOT) {
    console.log(colors.primary(center(line)));
  }

  console.log();
  console.log(center(chalk.bold.hex('#89CFF0')('M A G I')));
  console.log(center(colors.dim('AI Coding Agent')));
  console.log();
  console.log(center(colors.muted(`Welcome back, ${userName}`)));
  console.log(center(colors.dim(`${agentInfo.emoji} ${agentInfo.name} · ${config.projectType || 'project'}`)));
  console.log(center(colors.dim(config.projectDir)));
  console.log();
  console.log(center(colors.dim('Type a message to start · /help for commands · /exit to quit')));
  console.log();
}

// ─── Agent response header ───────────────────────────────────
export function renderAgentHeader(agentName, emoji) {
  process.stdout.write('\n  ' + colors.primary(emoji + ' ' + chalk.bold(agentName)) + '\n\n');
}

// ─── Streaming text output (character by character) ──────────
export function writeStreamChar(char) {
  process.stdout.write(char);
}

// ─── Finish streaming block ─────────────────────────────────
export function renderStreamEnd() {
  process.stdout.write('\n');
}

// ─── Tool Call Block (┌│└ style) ─────────────────────────────
export function renderToolStart(toolName, summary) {
  const label = summary ? `${toolName}: ${summary}` : toolName;
  console.log('\n  ' + colors.dim('┌ ') + colors.secondary(label));
}

export function renderToolOutput(text, maxLines = 15) {
  if (!text) return;
  const lines = text.split('\n');
  const show = lines.slice(0, maxLines);
  for (const line of show) {
    console.log('  ' + colors.dim('│ ') + line);
  }
  if (lines.length > maxLines) {
    console.log('  ' + colors.dim('│ ') + colors.dim(`... (${lines.length - maxLines} more lines)`));
  }
}

export function renderToolEnd(success, message) {
  if (success) {
    console.log('  ' + colors.dim('└ ') + colors.success('✓') + ' ' + colors.dim(message || 'Done'));
  } else {
    console.log('  ' + colors.dim('└ ') + colors.error('✗') + ' ' + colors.error(message || 'Failed'));
  }
  console.log();
}

// ─── Diff display ────────────────────────────────────────────
export function renderDiff(filename, oldText, newText) {
  console.log('  ' + colors.dim('│'));
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Show removed lines
  for (const line of oldLines) {
    if (!newLines.includes(line)) {
      console.log('  ' + colors.dim('│ ') + colors.error('- ' + line));
    }
  }
  // Show added lines
  for (const line of newLines) {
    if (!oldLines.includes(line)) {
      console.log('  ' + colors.dim('│ ') + colors.success('+ ' + line));
    }
  }
}

// ─── Confirmation prompt ─────────────────────────────────────
export function getConfirmPrompt(summary) {
  return '  ' + colors.dim('└ ') + colors.warning(`Allow ${summary}? `) + colors.dim('[Y/n] ');
}

// ─── Error ───────────────────────────────────────────────────
export function renderError(message) {
  console.log('\n  ' + colors.error('✗ Error: ' + message) + '\n');
}

// ─── Help Screen ─────────────────────────────────────────────
export function renderHelp() {
  const cmds = [
    ['/help',         'Show this help'],
    ['/agent <name>', 'Switch to a different agent'],
    ['/agents',       'List all available agents'],
    ['/context',      'Show files in current context'],
    ['/undo',         'Revert last file change'],
    ['/clear',        'Clear chat history'],
    ['/compact',      'Compress old messages'],
    ['/resume',       'Resume last session'],
    ['/exit',         'Quit MAGI Code'],
  ];

  console.log('\n  ' + colors.primary(chalk.bold('🐱 MAGI Code Commands')) + '\n');
  for (const [cmd, desc] of cmds) {
    console.log('  ' + colors.primary(padTo(cmd, 20)) + colors.dim(desc));
  }
  console.log();
  console.log('  ' + colors.dim('Shortcuts: Ctrl+C cancel response  ·  Ctrl+D exit  ·  ↑↓ history'));
  console.log();
}

// ─── Agents List ─────────────────────────────────────────────
export function renderAgentList(agents, currentAgent) {
  console.log('\n  ' + colors.primary(chalk.bold('Available Agents')) + '\n');
  for (const [id, a] of Object.entries(agents)) {
    const marker = id === currentAgent ? colors.success('◉') : colors.dim('○');
    console.log('  ' + marker + ' ' + a.emoji + ' ' + chalk.bold(padTo(a.name, 10)) + colors.dim(a.role));
  }
  console.log();
}

// ─── Context Display ─────────────────────────────────────────
export function renderContext(files, tokenEstimate) {
  console.log('\n  ' + colors.primary(chalk.bold('📂 Context')) + '\n');
  if (files.length === 0) {
    console.log('  ' + colors.dim('No files in context yet'));
  } else {
    for (const f of files) {
      console.log('  ' + colors.dim('•') + ' ' + f);
    }
  }
  console.log('  ' + colors.dim(`~${tokenEstimate} tokens estimated`));
  console.log();
}

// ─── Prompt string ───────────────────────────────────────────
export function getPromptString() {
  return colors.success('> ');
}
