/**
 * MAGI Code — Tool Implementations
 */
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';

// Undo stack for file operations
const undoStack = [];

export function getUndoStack() {
  return undoStack;
}

const TOOLS = {
  read_file: {
    description: 'Read the contents of a file',
    params: ['path'],
    needsConfirm: false,
    execute: async ({ path: filePath }) => {
      const resolved = resolvePath(filePath);
      if (!fs.existsSync(resolved)) {
        throw new Error(`File not found: ${filePath}`);
      }
      const stat = fs.statSync(resolved);
      if (stat.size > 1024 * 1024) {
        throw new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max 1MB.`);
      }
      return fs.readFileSync(resolved, 'utf-8');
    },
  },

  write_file: {
    description: 'Create or overwrite a file with new content',
    params: ['path', 'content'],
    needsConfirm: true,
    execute: async ({ path: filePath, content }) => {
      const resolved = resolvePath(filePath);
      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Save for undo
      const existed = fs.existsSync(resolved);
      const oldContent = existed ? fs.readFileSync(resolved, 'utf-8') : null;
      undoStack.push({
        type: 'write_file',
        path: resolved,
        oldContent,
        existed,
        timestamp: Date.now(),
      });

      fs.writeFileSync(resolved, content, 'utf-8');
      return `Wrote ${content.length} bytes to ${filePath}`;
    },
  },

  edit_file: {
    description: 'Edit a file by replacing specific text',
    params: ['path', 'old_text', 'new_text'],
    needsConfirm: true,
    execute: async ({ path: filePath, old_text, new_text }) => {
      const resolved = resolvePath(filePath);
      if (!fs.existsSync(resolved)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const content = fs.readFileSync(resolved, 'utf-8');
      if (!content.includes(old_text)) {
        throw new Error(`Could not find the specified text in ${filePath}`);
      }

      // Save for undo
      undoStack.push({
        type: 'edit_file',
        path: resolved,
        oldContent: content,
        existed: true,
        timestamp: Date.now(),
      });

      const newContent = content.replace(old_text, new_text);
      fs.writeFileSync(resolved, newContent, 'utf-8');

      const oldLines = old_text.split('\n').length;
      const newLines = new_text.split('\n').length;
      return `Edited ${filePath}: replaced ${oldLines} line(s) with ${newLines} line(s)`;
    },
  },

  run_command: {
    description: 'Execute a shell command',
    params: ['command'],
    needsConfirm: true,
    execute: async ({ command }) => {
      return new Promise((resolve, reject) => {
        const proc = spawn('bash', ['-c', command], {
          cwd: process.cwd(),
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (code) => {
          const output = (stdout + (stderr ? '\nSTDERR:\n' + stderr : '')).trim();
          if (code !== 0) {
            resolve(`[exit code ${code}]\n${output}`);
          } else {
            resolve(output || '(no output)');
          }
        });

        proc.on('error', (err) => {
          reject(new Error(`Command failed: ${err.message}`));
        });
      });
    },
  },

  search_files: {
    description: 'Search for text across files in the project',
    params: ['query', 'path'],
    needsConfirm: false,
    execute: async ({ query, path: searchPath }) => {
      const dir = searchPath ? resolvePath(searchPath) : process.cwd();
      try {
        const result = execSync(
          `grep -rn --include='*' -l "${query.replace(/"/g, '\\"')}" "${dir}" 2>/dev/null | head -20`,
          { timeout: 10000, encoding: 'utf-8' }
        ).trim();

        if (!result) return 'No matches found';

        // Get snippets
        const files = result.split('\n');
        const snippets = [];
        for (const file of files.slice(0, 10)) {
          try {
            const matches = execSync(
              `grep -n "${query.replace(/"/g, '\\"')}" "${file}" 2>/dev/null | head -3`,
              { timeout: 5000, encoding: 'utf-8' }
            ).trim();
            const relPath = path.relative(process.cwd(), file);
            snippets.push(`${relPath}:\n${matches}`);
          } catch { /* skip */ }
        }
        return snippets.join('\n\n') || 'No matches found';
      } catch {
        return 'No matches found';
      }
    },
  },

  list_files: {
    description: 'List files and directories',
    params: ['path'],
    needsConfirm: false,
    execute: async ({ path: dirPath }) => {
      const resolved = resolvePath(dirPath || '.');
      if (!fs.existsSync(resolved)) {
        throw new Error(`Directory not found: ${dirPath}`);
      }

      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const dirs = [];
      const files = [];

      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
        if (entry.isDirectory()) {
          dirs.push(entry.name + '/');
        } else {
          files.push(entry.name);
        }
      }

      dirs.sort();
      files.sort();

      return [...dirs.map(d => `📁 ${d}`), ...files.map(f => `📄 ${f}`)].join('\n') || '(empty directory)';
    },
  },
};

function resolvePath(p) {
  if (path.isAbsolute(p)) return p;
  return path.resolve(process.cwd(), p);
}

export function getTool(name) {
  return TOOLS[name] || null;
}

export function getToolDefinitions() {
  return Object.entries(TOOLS).map(([name, tool]) => ({
    name,
    description: tool.description,
    params: tool.params,
    needsConfirm: !!tool.needsConfirm,
  }));
}

export async function executeTool(name, args) {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.execute(args);
}

export function needsConfirmation(name) {
  const tool = TOOLS[name];
  return tool ? !!tool.needsConfirm : true;
}

export function performUndo() {
  if (undoStack.length === 0) {
    return null;
  }

  const last = undoStack.pop();
  
  if (last.oldContent === null && !last.existed) {
    // File was newly created — delete it
    if (fs.existsSync(last.path)) {
      fs.unlinkSync(last.path);
    }
    return { path: last.path, action: 'deleted (was newly created)' };
  } else {
    // Restore old content
    fs.writeFileSync(last.path, last.oldContent, 'utf-8');
    return { path: last.path, action: 'restored to previous version' };
  }
}

export default TOOLS;
