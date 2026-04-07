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
    needsConfirm: true,
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
    needsConfirm: true,
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
    needsConfirm: true,
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
