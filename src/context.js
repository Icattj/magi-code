/**
 * MAGI Code — Codebase Context Builder
 */
import fs from 'fs';
import path from 'path';

export class ContextBuilder {
  constructor(projectDir, ignorePatterns) {
    this.projectDir = projectDir;
    this.ignorePatterns = ignorePatterns || [];
  }

  getFileTreeString(maxDepth = 3) {
    const tree = this._walkDir(this.projectDir, 0, maxDepth);
    return this._renderTree(tree, '', true);
  }

  generateSummary() {
    const treeStr = this.getFileTreeString(3);
    const projectName = path.basename(this.projectDir);
    const lines = [
      `Project: ${projectName}`,
      `Root: ${this.projectDir}`,
      '',
      'File structure:',
      treeStr,
    ];
    const configs = this._detectConfigs();
    if (configs.length > 0) {
      lines.push('', 'Project configuration:');
      for (const c of configs) lines.push(`- ${c}`);
    }
    return lines.join('\n');
  }

  _walkDir(dir, depth, maxDepth) {
    if (depth >= maxDepth) return null;
    const node = { name: path.basename(dir), type: 'directory', children: [] };
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return node; }

    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (this._shouldIgnore(entry.name)) continue;
      if (entry.isDirectory()) {
        const child = this._walkDir(path.join(dir, entry.name), depth + 1, maxDepth);
        if (child) node.children.push(child);
      } else if (entry.isFile()) {
        node.children.push({ name: entry.name, type: 'file' });
      }
    }
    return node;
  }

  _renderTree(node, prefix, isLast) {
    if (!node) return '';
    const lines = [];
    const connector = isLast ? '└── ' : '├── ';
    const icon = node.type === 'directory' ? '📁 ' : '📄 ';
    if (prefix !== undefined && prefix !== null) {
      lines.push(prefix + connector + icon + node.name);
    }
    if (node.children) {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      for (let i = 0; i < node.children.length; i++) {
        lines.push(this._renderTree(node.children[i], childPrefix, i === node.children.length - 1));
      }
    }
    return lines.filter(Boolean).join('\n');
  }

  _shouldIgnore(name) {
    if (name.startsWith('.')) return true;
    for (const pattern of this.ignorePatterns) {
      if (pattern === name) return true;
      if (pattern.startsWith('*') && name.endsWith(pattern.slice(1))) return true;
      if (pattern.endsWith('*') && name.startsWith(pattern.slice(0, -1))) return true;
      if (pattern.endsWith('/') && name === pattern.slice(0, -1)) return true;
    }
    return false;
  }

  _detectConfigs() {
    const configs = [];
    const checks = [
      ['package.json', () => {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(this.projectDir, 'package.json'), 'utf-8'));
          return `Node.js: ${pkg.name || 'unnamed'} v${pkg.version || '0.0.0'}`;
        } catch { return 'Node.js project'; }
      }],
      ['tsconfig.json', () => 'TypeScript configured'],
      ['Cargo.toml',    () => 'Rust project'],
      ['pyproject.toml',() => 'Python project'],
      ['go.mod',        () => 'Go project'],
      ['Dockerfile',    () => 'Docker configured'],
    ];
    for (const [file, describe] of checks) {
      if (fs.existsSync(path.join(this.projectDir, file))) configs.push(describe());
    }
    return configs;
  }
}
