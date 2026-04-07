/**
 * MAGI Code — Terminal UI Rendering
 */
import chalk from 'chalk';
import boxen from 'boxen';

// ─── Cat Mascot ──────────────────────────────────────────────
const CAT_MASCOT = [
  '   /\\_/\\   ',
  '  ( o.o )  ',
  '   > ^ <   ',
  '  /|   |\\  ',
  ' (_|   |_) ',
];

// ─── Colors ──────────────────────────────────────────────────
const colors = {
  primary: chalk.hex('#89CFF0'),    // Purple
  secondary: chalk.hex('#60A5FA'),  // Blue
  success: chalk.hex('#4ADE80'),    // Green
  warning: chalk.hex('#FBBF24'),    // Yellow
  error: chalk.hex('#F87171'),      // Red
  dim: chalk.dim,
  bold: chalk.bold,
  muted: chalk.gray,
};

// ─── Box Drawing Characters ──────────────────────────────────
const BOX = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│',
  ltee: '├', rtee: '┤',
};

/**
 * Draw a bordered box with title
 */
function drawBox(content, { title = '', width = 0, borderColor = colors.dim, titleColor = colors.primary } = {}) {
  const termWidth = process.stdout.columns || 80;
  const boxWidth = width || Math.min(termWidth - 2, 72);
  const innerWidth = boxWidth - 2;

  const lines = [];

  // Top border with optional title
  if (title) {
    const titleStr = ` ${typeof titleColor === 'function' ? titleColor(title) : title} `;
    const titleLen = stripAnsi(titleStr).length;
    const remaining = innerWidth - titleLen - 1;
    lines.push(
      borderColor(BOX.tl + BOX.h) + titleStr + borderColor(BOX.h.repeat(Math.max(0, remaining)) + BOX.tr)
    );
  } else {
    lines.push(borderColor(BOX.tl + BOX.h.repeat(innerWidth) + BOX.tr));
  }

  // Content lines
  const contentLines = content.split('\n');
  for (const line of contentLines) {
    const stripped = stripAnsi(line);
    const padding = Math.max(0, innerWidth - stripped.length);
    lines.push(borderColor(BOX.v) + ' ' + line + ' '.repeat(padding > 0 ? padding - 1 : 0) + (padding > 0 ? ' ' : '') + borderColor(BOX.v));
  }

  // Bottom border
  lines.push(borderColor(BOX.bl + BOX.h.repeat(innerWidth) + BOX.br));

  return lines.join('\n');
}

/**
 * Strip ANSI escape codes for length calculation
 */
function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\].*?\x07/g, '');
}

/**
 * Pad/truncate string to exact visible width
 */
function padTo(str, width) {
  const visible = stripAnsi(str).length;
  if (visible >= width) return str;
  return str + ' '.repeat(width - visible);
}

// ─── Welcome Screen ──────────────────────────────────────────
export function renderWelcome(config) {
  const termWidth = process.stdout.columns || 80;
  const agentInfo = config.agents[config.agent] || config.agents.magi;
  const userName = capitalize(config.userName);

  console.clear();

  const outerWidth = Math.min(termWidth - 2, 72);
  const innerWidth = outerWidth - 2;
  
  // Left panel content
  const leftWidth = 23;
  const rightWidth = innerWidth - leftWidth - 3;

  const leftLines = [
    '',
    `  Welcome back`,
    `  ${colors.primary(userName)}!`,
    '',
    ...CAT_MASCOT.map(l => colors.primary(l)),
    `  ${chalk.bold('MAGI')}`,
    '',
    `  ${colors.muted(agentInfo.emoji + ' ' + agentInfo.name)}`,
    `  ${colors.dim(truncate(config.projectDir, leftWidth - 2))}`,
  ];

  // Recent activity (mock for now, will load from session)
  const recentLines = [
    colors.muted('  Just started  ') + 'Ready to code',
    colors.muted('  ...           ') + '/resume for more',
  ];

  // What's new
  const newsLines = [
    '  /agents to switch agents',
    '  /panel for multi-agent consult',
    '  ctrl+b to background tasks',
    '  ... /help for more',
  ];

  // Build the welcome screen
  const output = [];
  const dim = colors.dim;

  // Outer top
  output.push(dim(BOX.tl + BOX.h.repeat(innerWidth) + BOX.tr));
  output.push(dim(BOX.v) + ' '.repeat(innerWidth) + dim(BOX.v));

  // Build side-by-side panels
  const leftPanel = [];
  // Left box top
  leftPanel.push(dim('  ' + BOX.tl + BOX.h.repeat(leftWidth) + BOX.tr));
  for (const line of leftLines) {
    leftPanel.push(dim('  ' + BOX.v) + padTo(line, leftWidth) + dim(BOX.v));
  }
  leftPanel.push(dim('  ' + BOX.bl + BOX.h.repeat(leftWidth) + BOX.br));

  // Right side: recent + news
  const rightPanel = [];
  // Recent activity box
  const recentTitle = ' Recent activity ';
  const recentRemaining = rightWidth - recentTitle.length - 1;
  rightPanel.push(dim(BOX.tl + BOX.h) + colors.secondary(recentTitle) + dim(BOX.h.repeat(Math.max(0, recentRemaining)) + BOX.tr));
  for (const line of recentLines) {
    rightPanel.push(dim(BOX.v) + padTo(line, rightWidth) + dim(BOX.v));
  }
  rightPanel.push(dim(BOX.bl + BOX.h.repeat(rightWidth) + BOX.br));

  // What's new box
  const newsTitle = " What's new ";
  const newsRemaining = rightWidth - newsTitle.length - 1;
  rightPanel.push(dim(BOX.tl + BOX.h) + colors.warning(newsTitle) + dim(BOX.h.repeat(Math.max(0, newsRemaining)) + BOX.tr));
  for (const line of newsLines) {
    rightPanel.push(dim(BOX.v) + padTo(line, rightWidth) + dim(BOX.v));
  }
  rightPanel.push(dim(BOX.bl + BOX.h.repeat(rightWidth) + BOX.br));

  // Merge panels
  const maxLines = Math.max(leftPanel.length, rightPanel.length);
  for (let i = 0; i < maxLines; i++) {
    const left = i < leftPanel.length ? leftPanel[i] : ' '.repeat(leftWidth + 4);
    const right = i < rightPanel.length ? rightPanel[i] : '';
    const leftVisible = stripAnsi(left).length;
    const rightStr = right;
    const gap = Math.max(1, innerWidth - leftVisible - stripAnsi(rightStr).length);
    output.push(dim(BOX.v) + left + ' '.repeat(gap) + rightStr + dim(BOX.v));
  }

  output.push(dim(BOX.v) + ' '.repeat(innerWidth) + dim(BOX.v));

  // Prompt hint
  const promptHint = `  ${colors.success('>')} ${colors.dim('_')}`;
  output.push(dim(BOX.v) + promptHint + ' '.repeat(Math.max(0, innerWidth - stripAnsi(promptHint).length)) + dim(BOX.v));

  // Outer bottom
  output.push(dim(BOX.bl + BOX.h.repeat(innerWidth) + BOX.br));

  console.log(output.join('\n'));
  console.log();
}

// ─── Agent Response Box ──────────────────────────────────────
export function renderResponseStart(agentName, emoji) {
  const termWidth = process.stdout.columns || 80;
  const boxWidth = Math.min(termWidth - 4, 72);
  const title = `${emoji} ${agentName}`;
  const titleLen = stripAnsi(title).length + 2;
  const remaining = boxWidth - titleLen - 2;
  
  process.stdout.write(
    colors.primary(BOX.tl + BOX.h + ' ') + 
    colors.bold(title) + 
    colors.primary(' ' + BOX.h.repeat(Math.max(0, remaining)) + BOX.tr) + 
    '\n'
  );
}

export function renderResponseLine(text) {
  const termWidth = process.stdout.columns || 80;
  const boxWidth = Math.min(termWidth - 4, 72);
  const innerWidth = boxWidth - 2;

  const lines = wrapText(text, innerWidth - 2);
  for (const line of lines) {
    const padding = Math.max(0, innerWidth - stripAnsi(line).length);
    process.stdout.write(colors.primary(BOX.v) + ' ' + line + ' '.repeat(Math.max(0, padding - 1)) + (padding > 0 ? ' ' : '') + colors.primary(BOX.v) + '\n');
  }
}

export function renderResponseEnd() {
  const termWidth = process.stdout.columns || 80;
  const boxWidth = Math.min(termWidth - 4, 72);
  process.stdout.write(colors.primary(BOX.bl + BOX.h.repeat(boxWidth - 2) + BOX.br) + '\n\n');
}

// ─── Tool Call Display ───────────────────────────────────────
export function renderToolCall(toolName, args) {
  const termWidth = process.stdout.columns || 80;
  const boxWidth = Math.min(termWidth - 8, 66);
  const innerWidth = boxWidth - 2;

  let summary = '';
  if (args.path) summary = args.path;
  else if (args.command) summary = args.command;
  else if (args.query) summary = args.query;
  
  const title = `${toolName}${summary ? ': ' + summary : ''}`;
  const titleLen = Math.min(stripAnsi(title).length, innerWidth - 4);

  const out = [];
  out.push(
    '  ' + colors.dim(BOX.tl + BOX.h + ' ') + 
    colors.secondary(truncate(title, innerWidth - 4)) + 
    ' ' + colors.dim(BOX.h.repeat(Math.max(0, innerWidth - titleLen - 4)) + BOX.tr)
  );

  return out.join('\n');
}

export function renderToolResult(toolName, result, success = true) {
  const termWidth = process.stdout.columns || 80;
  const boxWidth = Math.min(termWidth - 8, 66);
  const innerWidth = boxWidth - 2;

  const icon = success ? colors.success('✓') : colors.error('✗');
  const preview = truncateMultiline(result, 8, innerWidth - 4);

  const lines = [];
  for (const line of preview.split('\n')) {
    const padded = padTo(line, innerWidth - 2);
    lines.push('  ' + colors.dim(BOX.v) + ' ' + padded + ' ' + colors.dim(BOX.v));
  }

  lines.push('  ' + colors.dim(BOX.bl + BOX.h.repeat(innerWidth) + BOX.br));
  lines.push('  ' + icon + colors.dim(` ${toolName} done`));

  return lines.join('\n');
}

// ─── Diff Display ────────────────────────────────────────────
export function renderDiff(filename, oldText, newText) {
  const lines = [];
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Simple inline diff
  lines.push(colors.dim(`  --- ${filename}`));
  lines.push(colors.dim(`  +++ ${filename}`));

  for (const line of oldLines) {
    if (!newLines.includes(line)) {
      lines.push(colors.error(`  - ${line}`));
    }
  }
  for (const line of newLines) {
    if (!oldLines.includes(line)) {
      lines.push(colors.success(`  + ${line}`));
    }
  }
  
  return lines.join('\n');
}

// ─── Error Display ───────────────────────────────────────────
export function renderError(message) {
  console.log(
    boxen(colors.error(message), {
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      borderColor: 'red',
      borderStyle: 'round',
      title: '✗ Error',
      titleAlignment: 'left',
    })
  );
}

// ─── Help Screen ─────────────────────────────────────────────
export function renderHelp() {
  const cmds = [
    ['/help',              'Show this help'],
    ['/agent <name>',      'Switch to a different agent'],
    ['/agents',            'List all available agents'],
    ['/panel <question>',  'Ask multiple agents (roundtable)'],
    ['/context',           'Show files in current context'],
    ['/undo',              'Revert last file change'],
    ['/clear',             'Clear chat history'],
    ['/compact',           'Compress old messages'],
    ['/resume',            'Resume last session'],
    ['/exit',              'Quit MAGI Code'],
  ];

  const lines = cmds.map(([cmd, desc]) => {
    return `  ${colors.primary(padTo(cmd, 22))} ${colors.dim(desc)}`;
  });

  console.log();
  console.log(drawBox(lines.join('\n'), { title: '🐱 MAGI Code Commands', titleColor: colors.primary }));
  console.log();
  console.log(colors.dim('  Shortcuts: Ctrl+C cancel response  •  Ctrl+D exit  •  ↑↓ history'));
  console.log();
}

// ─── Agents List ─────────────────────────────────────────────
export function renderAgentList(agents, currentAgent) {
  const lines = Object.entries(agents).map(([id, a]) => {
    const marker = id === currentAgent ? colors.success(' ◉ ') : '   ';
    return `${marker}${a.emoji} ${colors.bold(padTo(a.name, 10))} ${colors.dim(a.role)}`;
  });
  console.log();
  console.log(drawBox(lines.join('\n'), { title: 'Available Agents' }));
  console.log();
}

// ─── Context Display ─────────────────────────────────────────
export function renderContext(files, tokenEstimate) {
  const lines = files.map(f => `  ${colors.dim('•')} ${f}`);
  if (lines.length === 0) lines.push(colors.dim('  No files in context yet'));
  lines.push('');
  lines.push(colors.dim(`  ~${tokenEstimate} tokens estimated`));
  
  console.log();
  console.log(drawBox(lines.join('\n'), { title: '📂 Context' }));
  console.log();
}

// ─── Prompt ──────────────────────────────────────────────────
export function getPromptString() {
  return colors.success('> ');
}

// ─── Utilities ───────────────────────────────────────────────
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

function truncateMultiline(str, maxLines, maxWidth) {
  const lines = str.split('\n').slice(0, maxLines);
  return lines.map(l => truncate(l, maxWidth)).join('\n');
}

function wrapText(text, width) {
  if (!text) return [''];
  const result = [];
  for (const line of text.split('\n')) {
    if (stripAnsi(line).length <= width) {
      result.push(line);
    } else {
      let remaining = line;
      while (stripAnsi(remaining).length > width) {
        const cut = findCutPoint(remaining, width);
        result.push(remaining.slice(0, cut));
        remaining = remaining.slice(cut);
      }
      if (remaining) result.push(remaining);
    }
  }
  return result;
}

function findCutPoint(str, maxWidth) {
  let visible = 0;
  let i = 0;
  let lastSpace = -1;
  while (i < str.length && visible < maxWidth) {
    if (str[i] === '\x1B') {
      const match = str.slice(i).match(/^\x1B\[[0-9;]*[a-zA-Z]/);
      if (match) { i += match[0].length; continue; }
    }
    if (str[i] === ' ') lastSpace = i;
    visible++;
    i++;
  }
  return lastSpace > maxWidth * 0.3 ? lastSpace + 1 : i;
}

export { colors, stripAnsi, drawBox, padTo, truncate, BOX };
