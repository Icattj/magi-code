/**
 * MAGI Code — Tool Implementations
 * All tools are synchronous/simple. Confirmation handled by caller.
 */
import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';

// Undo stack for file operations
const undoStack = [];

/**
 * Resolve a path relative to cwd
 */
function resolvePath(p) {
  if (path.isAbsolute(p)) return p;
  return path.resolve(process.cwd(), p);
}

/**
 * Backup a file before modifying it
 */
function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const backupDir = path.join(process.cwd(), '.magi', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const basename = path.basename(filePath);
  const timestamp = Date.now();
  const backupPath = path.join(backupDir, `${basename}.${timestamp}.bak`);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

// ─── Tool definitions ────────────────────────────────────────

// ── Remote Server Execution ──
const REMOTE_HOST = process.env.MAGI_SERVER || 'root@64.227.110.70';

async function remoteExec(command) {
  const { execSync } = await import('child_process');
  try {
    return execSync(`ssh ${REMOTE_HOST} "${command.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8',
      timeout: 30000
    });
  } catch (e) {
    return 'Error: ' + (e.message || 'SSH failed');
  }
}

async function remoteReadFile(path) {
  return remoteExec(`cat "${path}"`);
}

async function remoteWriteFile(path, content) {
  const { execSync } = await import('child_process');
  const tmpFile = '/tmp/magi-remote-' + Date.now();
  const fs = await import('fs');
  fs.writeFileSync(tmpFile, content);
  execSync(`scp ${tmpFile} ${REMOTE_HOST}:${path}`, { timeout: 15000 });
  fs.unlinkSync(tmpFile);
  return 'Written to server: ' + path;
}

async function remoteListFiles(path) {
  return remoteExec(`ls -la "${path || '/home/openclaw'}"`);
}

async function remoteSearchFiles(query, path) {
  return remoteExec(`grep -rn "${query}" "${path || '/home/openclaw'}" --include="*.js" --include="*.html" --include="*.css" --include="*.json" --include="*.md" 2>/dev/null | head -20`);
}


// ── Full Computer Control (macOS) ──
async function takeScreenshot() {
  const { execSync } = await import('child_process');
  const path = '/tmp/magi-screenshot-' + Date.now() + '.png';
  try {
    execSync('screencapture -x ' + path, { timeout: 5000 });
    // Convert to base64 for context (first 500 chars to save tokens)
    const desc = execSync('osascript -e \'tell application "System Events" to get {name, title} of every window of every process whose visible is true\'', { encoding: 'utf8', timeout: 5000 });
    return 'Screenshot saved: ' + path + '\nVisible windows:\n' + desc;
  } catch (e) {
    return 'Screenshot failed: ' + e.message;
  }
}

async function clickAt(x, y) {
  const { execSync } = await import('child_process');
  try {
    execSync('osascript -e \'tell application "System Events" to click at {' + x + ',' + y + '}\'', { timeout: 3000 });
    return 'Clicked at (' + x + ',' + y + ')';
  } catch {
    // Fallback with cliclick if installed
    try {
      execSync('cliclick c:' + x + ',' + y, { timeout: 3000 });
      return 'Clicked at (' + x + ',' + y + ')';
    } catch {
      return 'Click failed — install cliclick: brew install cliclick';
    }
  }
}

async function typeText(text) {
  const { execSync } = await import('child_process');
  try {
    execSync('osascript -e \'tell application "System Events" to keystroke "' + text.replace(/"/g, '\\"') + '"\'', { timeout: 5000 });
    return 'Typed: ' + text;
  } catch (e) {
    return 'Type failed: ' + e.message;
  }
}

async function pressKey(key) {
  const { execSync } = await import('child_process');
  const keyMap = {
    'enter': 'return', 'tab': 'tab', 'escape': 'escape', 'space': 'space',
    'backspace': 'delete', 'delete': 'forward delete',
    'up': 'up arrow', 'down': 'down arrow', 'left': 'left arrow', 'right': 'right arrow',
    'cmd+c': 'keystroke "c" using command down',
    'cmd+v': 'keystroke "v" using command down',
    'cmd+a': 'keystroke "a" using command down',
    'cmd+s': 'keystroke "s" using command down',
    'cmd+z': 'keystroke "z" using command down',
    'cmd+t': 'keystroke "t" using command down',
    'cmd+w': 'keystroke "w" using command down',
    'cmd+tab': 'keystroke tab using command down',
  };
  try {
    const mapped = keyMap[key.toLowerCase()];
    if (mapped && mapped.includes('keystroke')) {
      execSync('osascript -e \'tell application "System Events" to ' + mapped + '\'', { timeout: 3000 });
    } else {
      execSync('osascript -e \'tell application "System Events" to key code ' + (mapped || key) + '\'', { timeout: 3000 });
    }
    return 'Pressed: ' + key;
  } catch (e) {
    return 'Key press failed: ' + e.message;
  }
}

async function openApp(appName) {
  const { execSync } = await import('child_process');
  try {
    execSync('open -a "' + appName + '"', { timeout: 5000 });
    return 'Opened: ' + appName;
  } catch (e) {
    return 'Failed to open ' + appName + ': ' + e.message;
  }
}

async function openBrowser(url) {
  const { execSync } = await import('child_process');
  try {
    execSync('open "' + url + '"', { timeout: 5000 });
    return 'Opened in browser: ' + url;
  } catch (e) {
    return 'Failed: ' + e.message;
  }
}

async function getActiveWindow() {
  const { execSync } = await import('child_process');
  try {
    const result = execSync('osascript -e \'tell application "System Events" to get {name, title} of first process whose frontmost is true\'', { encoding: 'utf8', timeout: 3000 });
    return 'Active window: ' + result.trim();
  } catch (e) {
    return 'Failed: ' + e.message;
  }
}

async function getRunningApps() {
  const { execSync } = await import('child_process');
  try {
    return execSync('osascript -e \'tell application "System Events" to get name of every process whose visible is true\'', { encoding: 'utf8', timeout: 5000 });
  } catch (e) {
    return 'Failed: ' + e.message;
  }
}

async function moveMouse(x, y) {
  const { execSync } = await import('child_process');
  try {
    execSync('cliclick m:' + x + ',' + y, { timeout: 3000 });
    return 'Mouse moved to (' + x + ',' + y + ')';
  } catch {
    return 'Install cliclick first: brew install cliclick';
  }
}

const TOOLS = {
  read_file: {
    description: 'Read the contents of a file',
    needsConfirm: false,
    execute({ path: filePath }) {
      const resolved = resolvePath(filePath);
      if (!fs.existsSync(resolved)) throw new Error(`File not found: ${filePath}`);
      const stat = fs.statSync(resolved);
      if (stat.size > 1024 * 1024) throw new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max 1MB.`);
      return fs.readFileSync(resolved, 'utf-8');
    },
  },

  write_file: {
    description: 'Create or overwrite a file',
    needsConfirm: false,
    execute({ path: filePath, content }) {
      const resolved = resolvePath(filePath);
      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const existed = fs.existsSync(resolved);
      const oldContent = existed ? fs.readFileSync(resolved, 'utf-8') : null;

      if (existed) backupFile(resolved);

      // Push undo entry
      undoStack.push({ path: resolved, oldContent, existed, timestamp: Date.now() });

      fs.writeFileSync(resolved, content, 'utf-8');
      return `Wrote ${content.length} bytes to ${filePath}`;
    },
  },

  edit_file: {
    description: 'Edit a file by replacing specific text',
    needsConfirm: false,
    execute({ path: filePath, old_text, new_text }) {
      const resolved = resolvePath(filePath);
      if (!fs.existsSync(resolved)) throw new Error(`File not found: ${filePath}`);

      const content = fs.readFileSync(resolved, 'utf-8');
      if (!content.includes(old_text)) throw new Error(`Could not find the specified text in ${filePath}`);

      backupFile(resolved);
      undoStack.push({ path: resolved, oldContent: content, existed: true, timestamp: Date.now() });

      const newContent = content.replace(old_text, new_text);
      fs.writeFileSync(resolved, newContent, 'utf-8');

      const oldLines = old_text.split('\n').length;
      const newLines = new_text.split('\n').length;
      return `Edited ${filePath}: replaced ${oldLines} line(s) with ${newLines} line(s)`;
    },
  },

  run_command: {
    description: 'Execute a shell command',
    needsConfirm: false,
    execute({ command }) {
      try {
        const result = execSync(command, {
          cwd: process.cwd(),
          timeout: 30000,
          maxBuffer: 2 * 1024 * 1024,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return result.trim() || '(no output)';
      } catch (err) {
        // execSync throws on non-zero exit
        const stdout = (err.stdout || '').trim();
        const stderr = (err.stderr || '').trim();
        const output = [stdout, stderr].filter(Boolean).join('\n');
        return `[exit code ${err.status || 1}]\n${output || '(no output)'}`;
      }
    },
  },

  search_files: {
    description: 'Search for text across files',
    needsConfirm: false,
    execute({ query, path: searchPath }) {
      const dir = searchPath ? resolvePath(searchPath) : process.cwd();
      try {
        const escaped = query.replace(/"/g, '\\"');
        const result = execSync(
          `grep -rn --include='*' "${escaped}" "${dir}" 2>/dev/null | head -30`,
          { timeout: 10000, encoding: 'utf-8' }
        ).trim();
        if (!result) return 'No matches found';
        // Make paths relative
        return result.split('\n').map(line => {
          return line.replace(dir + '/', '');
        }).join('\n');
      } catch {
        return 'No matches found';
      }
    },
  },

  open_url: {
    description: 'Open URL in browser',
    params: ['url'],
    needsConfirm: false,
    execute: async ({url}) => openUrl(url),
  },
  read_clipboard: {
    description: 'Read clipboard content',
    params: [],
    needsConfirm: false,
    execute: async () => readClipboard(),
  },
  write_clipboard: {
    description: 'Copy text to clipboard',
    params: ['text'],
    needsConfirm: false,
    execute: async ({text}) => writeClipboard(text),
  },
  read_screen: {
    description: 'List active windows/apps',
    params: [],
    needsConfirm: false,
    execute: async () => readScreen(),
  },
  screenshot: {
    description: 'Take screenshot and describe visible windows',
    params: [],
    needsConfirm: false,
    execute: async () => takeScreenshot(),
  },
  click: {
    description: 'Click at screen coordinates (x, y)',
    params: ['x', 'y'],
    needsConfirm: false,
    execute: async ({x, y}) => clickAt(x, y),
  },
  type_text: {
    description: 'Type text using keyboard',
    params: ['text'],
    needsConfirm: false,
    execute: async ({text}) => typeText(text),
  },
  press_key: {
    description: 'Press keyboard shortcut (enter, tab, cmd+c, cmd+v, cmd+s, etc)',
    params: ['key'],
    needsConfirm: false,
    execute: async ({key}) => pressKey(key),
  },
  open_app: {
    description: 'Open application by name (Safari, Terminal, VSCode, etc)',
    params: ['name'],
    needsConfirm: false,
    execute: async ({name}) => openApp(name),
  },
  open_browser: {
    description: 'Open URL in default browser',
    params: ['url'],
    needsConfirm: false,
    execute: async ({url}) => openBrowser(url),
  },
  active_window: {
    description: 'Get current active window info',
    params: [],
    needsConfirm: false,
    execute: async () => getActiveWindow(),
  },
  running_apps: {
    description: 'List all visible running applications',
    params: [],
    needsConfirm: false,
    execute: async () => getRunningApps(),
  },
  move_mouse: {
    description: 'Move mouse to coordinates (x, y)',
    params: ['x', 'y'],
    needsConfirm: false,
    execute: async ({x, y}) => moveMouse(x, y),
  },
  server_exec: {
    description: 'Run command on VPS server',
    params: ['command'],
    needsConfirm: false,
    execute: async ({command}) => remoteExec(command),
  },
  server_read: {
    description: 'Read file from VPS server',
    params: ['path'],
    needsConfirm: false,
    execute: async ({path}) => remoteReadFile(path),
  },
  server_write: {
    description: 'Write file to VPS server',
    params: ['path', 'content'],
    needsConfirm: false,
    execute: async ({path, content}) => remoteWriteFile(path, content),
  },
  server_list: {
    description: 'List files on VPS server',
    params: ['path'],
    needsConfirm: false,
    execute: async ({path}) => remoteListFiles(path || '/home/openclaw'),
  },
  server_search: {
    description: 'Search files on VPS server',
    params: ['query', 'path'],
    needsConfirm: false,
    execute: async ({query, path}) => remoteSearchFiles(query, path),
  },
  list_files: {
    description: 'List files and directories',
    needsConfirm: false,
    execute({ path: dirPath }) {
      const resolved = resolvePath(dirPath || '.');
      if (!fs.existsSync(resolved)) throw new Error(`Directory not found: ${dirPath}`);

      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const dirs = [];
      const files = [];

      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
        if (['node_modules', 'dist', 'build', '.next', '__pycache__', '.venv', 'target'].includes(entry.name)) continue;
        if (entry.isDirectory()) dirs.push(entry.name + '/');
        else files.push(entry.name);
      }

      dirs.sort();
      files.sort();
      return [...dirs.map(d => `📁 ${d}`), ...files.map(f => `📄 ${f}`)].join('\n') || '(empty directory)';
    },
  },
};

// ─── Public API ──────────────────────────────────────────────
export function executeTool(name, args) {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.execute(args);
}

export function needsConfirmation(name) {
  const tool = TOOLS[name];
  return tool ? !!tool.needsConfirm : true;
}

export function performUndo() {
  if (undoStack.length === 0) return null;
  const last = undoStack.pop();

  if (last.oldContent === null && !last.existed) {
    if (fs.existsSync(last.path)) fs.unlinkSync(last.path);
    return { path: last.path, action: 'deleted (was newly created)' };
  } else {
    fs.writeFileSync(last.path, last.oldContent, 'utf-8');
    return { path: last.path, action: 'restored to previous version' };
  }
}

// ── Browser & Screen Tools ──
async function openUrl(url) {
  const { execSync } = await import('child_process');
  try {
    // macOS
    execSync(`open "${url}"`, { timeout: 5000 });
    return `Opened ${url} in default browser`;
  } catch {
    try {
      // Linux
      execSync(`xdg-open "${url}"`, { timeout: 5000 });
      return `Opened ${url}`;
    } catch {
      return `Cannot open browser on this system`;
    }
  }
}

async function readScreen() {
  const { execSync } = await import('child_process');
  try {
    // macOS: capture screen text via accessibility
    const result = execSync("osascript -e 'tell application \"System Events\" to get name of every window of every process'", 
      { encoding: 'utf8', timeout: 5000 });
    return `Active windows:\n${result}`;
  } catch {
    return 'Screen reading not available on this system';
  }
}

async function readClipboard() {
  const { execSync } = await import('child_process');
  try {
    return execSync('pbpaste', { encoding: 'utf8', timeout: 3000 });
  } catch {
    try {
      return execSync('xclip -selection clipboard -o', { encoding: 'utf8', timeout: 3000 });
    } catch {
      return 'Clipboard not available';
    }
  }
}

async function writeClipboard(text) {
  const { execSync } = await import('child_process');
  try {
    execSync('pbcopy', { input: text, timeout: 3000 });
    return 'Copied to clipboard';
  } catch {
    return 'Clipboard write not available';
  }
}
