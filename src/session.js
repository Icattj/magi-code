/**
 * MAGI Code — Session Management
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class SessionManager {
  constructor(magiDir) {
    this.magiDir = magiDir;
    this.sessionsDir = path.join(magiDir, 'sessions');
    this.currentSession = null;
    this.messages = [];
    this.contextFiles = new Set();
    this.messageCount = 0;
    this.autoSaveInterval = 10;

    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  newSession() {
    this.currentSession = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };
    this.messages = [];
    this.contextFiles = new Set();
    this.messageCount = 0;
    return this.currentSession;
  }

  resume() {
    const sessions = this.listSessions();
    if (sessions.length === 0) return null;
    return this.loadSession(sessions[0].id);
  }

  loadSession(sessionId) {
    const sessionPath = path.join(this.sessionsDir, `${sessionId}.json`);
    if (!fs.existsSync(sessionPath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      this.currentSession = data.session;
      this.messages = data.messages || [];
      this.contextFiles = new Set(data.contextFiles || []);
      this.messageCount = this.messages.length;
      return this.currentSession;
    } catch { return null; }
  }

  listSessions() {
    if (!fs.existsSync(this.sessionsDir)) return [];
    return fs.readdirSync(this.sessionsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(this.sessionsDir, f), 'utf-8'));
          return {
            id: data.session.id,
            startedAt: data.session.startedAt,
            lastActivity: data.session.lastActivity,
            messageCount: (data.messages || []).length,
          };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
  }

  addMessage(role, content) {
    this.messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });
    this.messageCount++;
    if (this.currentSession) {
      this.currentSession.lastActivity = new Date().toISOString();
    }
    // Auto-save every N messages
    if (this.messageCount % this.autoSaveInterval === 0) {
      this.save();
    }
  }

  addToContext(filePath) {
    this.contextFiles.add(filePath);
  }

  getContextFiles() {
    return [...this.contextFiles];
  }

  estimateTokens() {
    const totalChars = this.messages.reduce((sum, m) => sum + (m.content || '').length, 0);
    return Math.ceil(totalChars / 4);
  }

  getApiMessages() {
    return this.messages.map(m => ({ role: m.role, content: m.content }));
  }

  compact() {
    if (this.messages.length < 10) return 0;
    const keep = 6;
    const toCompact = this.messages.slice(0, -keep);
    const kept = this.messages.slice(-keep);
    const summary = `[Session summary: ${toCompact.length} messages compacted.]`;
    this.messages = [
      { role: 'assistant', content: summary, timestamp: new Date().toISOString() },
      ...kept,
    ];
    this.save();
    return toCompact.length;
  }

  clear() {
    const count = this.messages.length;
    this.messages = [];
    this.contextFiles = new Set();
    this.messageCount = 0;
    this.save();
    return count;
  }

  save() {
    if (!this.currentSession) return;
    const sessionPath = path.join(this.sessionsDir, `${this.currentSession.id}.json`);
    const data = {
      session: this.currentSession,
      messages: this.messages,
      contextFiles: [...this.contextFiles],
    };
    try {
      fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch { /* swallow save errors */ }
  }
}
