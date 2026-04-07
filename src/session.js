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
    this.autoSaveInterval = 5;

    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * Start a new session
   */
  newSession() {
    this.currentSession = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };
    this.messages = [];
    this.contextFiles = new Set();
    this.messageCount = 0;
    this.save();
    return this.currentSession;
  }

  /**
   * Resume the most recent session
   */
  resume() {
    const sessions = this.listSessions();
    if (sessions.length === 0) return null;

    const latest = sessions[0];
    return this.loadSession(latest.id);
  }

  /**
   * Load a specific session
   */
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
    } catch {
      return null;
    }
  }

  /**
   * List all sessions (most recent first)
   */
  listSessions() {
    if (!fs.existsSync(this.sessionsDir)) return [];

    const files = fs.readdirSync(this.sessionsDir)
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
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

    return files;
  }

  /**
   * Get recent activity for welcome screen
   */
  getRecentActivity(limit = 4) {
    const sessions = this.listSessions();
    return sessions.slice(0, limit).map(s => {
      const ago = timeAgo(new Date(s.lastActivity));
      return { ago, messageCount: s.messageCount, id: s.id };
    });
  }

  /**
   * Add a message to the session
   */
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

    // Auto-save periodically
    if (this.messageCount % this.autoSaveInterval === 0) {
      this.save();
    }
  }

  /**
   * Add a file to context tracking
   */
  addToContext(filePath) {
    this.contextFiles.add(filePath);
  }

  /**
   * Get context files list
   */
  getContextFiles() {
    return [...this.contextFiles];
  }

  /**
   * Estimate token count (rough: ~4 chars per token)
   */
  estimateTokens() {
    const totalChars = this.messages.reduce((sum, m) => sum + (m.content || '').length, 0);
    return Math.ceil(totalChars / 4);
  }

  /**
   * Get messages formatted for API
   */
  getApiMessages() {
    return this.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * Compact old messages (summarize)
   */
  compact() {
    if (this.messages.length < 10) return 0;
    
    const keep = 6; // Keep last N messages
    const toCompact = this.messages.slice(0, -keep);
    const kept = this.messages.slice(-keep);
    
    const summary = `[Session summary: ${toCompact.length} messages compacted. ` +
      `Topics discussed: ${extractTopics(toCompact)}]`;
    
    this.messages = [
      { role: 'assistant', content: summary, timestamp: new Date().toISOString() },
      ...kept,
    ];
    
    this.save();
    return toCompact.length;
  }

  /**
   * Clear all messages
   */
  clear() {
    const count = this.messages.length;
    this.messages = [];
    this.contextFiles = new Set();
    this.messageCount = 0;
    this.save();
    return count;
  }

  /**
   * Save current session to disk
   */
  save() {
    if (!this.currentSession) return;

    const sessionPath = path.join(this.sessionsDir, `${this.currentSession.id}.json`);
    const data = {
      session: this.currentSession,
      messages: this.messages,
      contextFiles: [...this.contextFiles],
    };

    fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

// ─── Helpers ─────────────────────────────────────────────────
function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 604800)}w ago`;
}

function extractTopics(messages) {
  const userMessages = messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join(' ');
  
  // Very basic topic extraction
  const words = userMessages.split(/\s+/)
    .filter(w => w.length > 4)
    .reduce((acc, w) => { acc[w] = (acc[w] || 0) + 1; return acc; }, {});
  
  return Object.entries(words)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w)
    .join(', ') || 'general discussion';
}
