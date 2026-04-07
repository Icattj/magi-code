/**
 * MAGI Code — AI Agent Communication
 *
 * Core loop:
 *  1. Send messages to API (streaming SSE via http)
 *  2. Accumulate response text, print to terminal in real-time
 *  3. After stream ends, parse for <tool_call> XML tags
 *  4. If tool calls found:
 *     a. Display what tool is being called
 *     b. Execute tool (with confirmation for writes/exec)
 *     c. Append assistant message + tool result to messages
 *     d. Call API again → repeat from 1
 *  5. When response has no tool calls → done
 */
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { getSystemPrompt } from './config.js';
import { executeTool, needsConfirmation } from './tools.js';
import {
  renderAgentHeader, writeStreamChar, renderStreamEnd,
  renderToolStart, renderToolOutput, renderToolEnd,
  renderDiff, getConfirmPrompt, renderError, colors,
} from './ui.js';

const MAX_TOOL_ROUNDS = 15; // safety cap on tool call loops

/**
 * Send a user message and handle the full agent loop.
 * Returns when the agent is done (no more tool calls).
 *
 * @param {object}   config
 * @param {object}   session  - SessionManager instance
 * @param {string}   userMessage
 * @param {object}   opts
 * @param {Function} opts.onToolConfirm - async (toolName, args) => boolean
 * @param {object}   opts.abortSignal   - { aborted: boolean } for Ctrl+C cancellation
 */
export async function sendMessage(config, session, userMessage, { onToolConfirm, abortSignal }) {
  const agentInfo = config.agents[config.agent] || config.agents.magi;

  // Add user message to session
  session.addMessage('user', userMessage);

  // Show agent header once
  renderAgentHeader(agentInfo.name, agentInfo.emoji);

  // Indentation for streaming text
  let needsIndent = true;

  const systemPrompt = getSystemPrompt(config);

  // ── Agent loop: stream → parse → execute tools → repeat ──
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (abortSignal && abortSignal.aborted) break;

    const apiMessages = session.getApiMessages();

    // Stream the completion with XML suppression
    let fullResponse;
    try {
      // Buffer to detect and suppress XML tags during streaming
      // Suppresses: <tool_call>...</tool_call>, <tool_result>...</tool_result>, <reason>...</reason>
      let xmlBuffer = '';
      let insideXmlTag = false;
      let closingTag = '';

      const SUPPRESS_TAGS = ['<tool_call', '<tool_result', '<reason'];

      function flushChar(ch) {
        if (needsIndent) {
          process.stdout.write('  ');
          needsIndent = false;
        }
        if (ch === '\n') {
          process.stdout.write('\n');
          needsIndent = true;
        } else {
          process.stdout.write(ch);
        }
      }

      fullResponse = await streamCompletion(config, systemPrompt, apiMessages, (char) => {
        if (abortSignal && abortSignal.aborted) return;

        // If inside a suppressed XML block, absorb silently
        if (insideXmlTag) {
          xmlBuffer += char;
          if (xmlBuffer.endsWith(closingTag)) {
            xmlBuffer = '';
            insideXmlTag = false;
            closingTag = '';
          }
          return;
        }

        // Accumulate potential XML tag start
        xmlBuffer += char;

        // Check if buffer could be the start of any suppressed tag
        const couldMatch = SUPPRESS_TAGS.some(tag => tag.startsWith(xmlBuffer));
        if (couldMatch && xmlBuffer.length < 12) {
          return; // keep buffering
        }

        // Check if buffer IS a suppressed tag start
        const matched = SUPPRESS_TAGS.find(tag => xmlBuffer.startsWith(tag));
        if (matched) {
          // Determine the closing tag
          const tagName = matched.slice(1); // e.g. "tool_call"
          closingTag = `</${tagName}>`;
          insideXmlTag = true;
          return;
        }

        // Not a match — flush buffer to display
        for (const ch of xmlBuffer) {
          flushChar(ch);
        }
        xmlBuffer = '';
      });
    } catch (err) {
      renderError(`API Error: ${err.message}`);
      if (err.message.includes('API key') || err.message.includes('401')) {
        console.log(colors.warning('  Set your API key:'));
        console.log(colors.dim('  export MAGI_API_KEY=your-key-here\n'));
      }
      return;
    }

    if (abortSignal && abortSignal.aborted) {
      console.log(colors.warning('\n  (cancelled)'));
      break;
    }

    // End streaming block
    renderStreamEnd();

    // Parse tool calls from the full response
    const { text, toolCalls } = parseToolCalls(fullResponse);

    // Add assistant message to session
    session.addMessage('assistant', fullResponse);

    // No tool calls → done
    if (toolCalls.length === 0) {
      break;
    }

    // Execute each tool call
    for (const tc of toolCalls) {
      if (abortSignal && abortSignal.aborted) break;

      const summary = tc.args.path || tc.args.command || tc.args.query || '';
      renderToolStart(tc.name, summary);

      // Confirmation for destructive tools
      if (needsConfirmation(tc.name)) {
        const confirmSummary = tc.name === 'run_command'
          ? `run: ${tc.args.command}`
          : tc.name === 'write_file'
          ? `write: ${tc.args.path}`
          : tc.name === 'edit_file'
          ? `edit: ${tc.args.path}`
          : tc.name;

        const confirmed = await onToolConfirm(confirmSummary, tc.args);
        if (!confirmed) {
          renderToolEnd(false, 'Skipped by user');
          session.addMessage('user', `[Tool Result: ${tc.name}]\nUser declined to execute this tool.`);
          continue;
        }
      }

      // Show diff preview for edit_file before execution
      if (tc.name === 'edit_file' && tc.args.old_text && tc.args.new_text) {
        renderDiff(tc.args.path, tc.args.old_text, tc.args.new_text);
      }

      // Execute
      let result;
      try {
        result = executeTool(tc.name, tc.args);
        // Track context for read_file
        if (tc.name === 'read_file' && tc.args.path) {
          session.addToContext(tc.args.path);
        }
        renderToolOutput(truncateDisplay(result, 200));
        renderToolEnd(true, `${tc.name} done`);
      } catch (err) {
        result = `Error: ${err.message}`;
        renderToolEnd(false, err.message);
      }

      // Feed tool result back to the conversation
      session.addMessage('user', `[Tool Result: ${tc.name}]\n${truncateForContext(result)}`);
    }

    // Reset indent for next round's streaming
    needsIndent = true;

    // Show continuation header
    process.stdout.write('\n');
  }

  session.save();
}

/**
 * Stream an SSE chat completion using the http/https module.
 * Calls onChar(char) for each content character received.
 * Returns the full accumulated text.
 */
function streamCompletion(config, systemPrompt, messages, onChar) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.apiUrl);

    const body = JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + (url.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'Accept': 'text/event-stream',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errorBody = '';
        res.on('data', (chunk) => { errorBody += chunk; });
        res.on('end', () => {
          try {
            const err = JSON.parse(errorBody);
            reject(new Error(err.error?.message || `API returned ${res.statusCode}`));
          } catch {
            reject(new Error(`API returned ${res.statusCode}: ${errorBody.slice(0, 300)}`));
          }
        });
        return;
      }

      let fullText = '';
      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();

        // Process complete SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete trailing line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue; // skip empty/comments

          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);
              const content = event.choices?.[0]?.delta?.content;
              if (content) {
                fullText += content;
                // Call char-by-char callback
                for (const ch of content) {
                  onChar(ch);
                }
              }
            } catch {
              // malformed JSON line, skip
            }
          }
        }
      });

      res.on('end', () => {
        // Process any remaining buffer
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
            try {
              const event = JSON.parse(trimmed.slice(6));
              const content = event.choices?.[0]?.delta?.content;
              if (content) {
                fullText += content;
                for (const ch of content) onChar(ch);
              }
            } catch { /* skip */ }
          }
        }
        resolve(fullText);
      });

      res.on('error', reject);
    });

    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        reject(new Error(`Cannot connect to API at ${config.apiUrl}. Is the server running?`));
      } else {
        reject(err);
      }
    });

    req.write(body);
    req.end();
  });
}

/**
 * Parse <tool_call> XML tags from response text.
 *
 * Format:
 *   <tool_call name="read_file">
 *     <param name="path">src/app.js</param>
 *   </tool_call>
 *
 * Returns { text, toolCalls[] }
 */
function parseToolCalls(responseText) {
  const toolCalls = [];
  let text = responseText;

  const toolCallRegex = /<tool_call\s+name="([^"]+)">([\s\S]*?)<\/tool_call>/g;
  let match;

  while ((match = toolCallRegex.exec(responseText)) !== null) {
    const toolName = match[1];
    const paramsStr = match[2];
    const args = {};

    const paramRegex = /<param\s+name="([^"]+)">([\s\S]*?)<\/param>/g;
    let paramMatch;
    while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
      args[paramMatch[1]] = paramMatch[2].trim();
    }

    toolCalls.push({ name: toolName, args });
    // Remove tool call XML from display text
    text = text.replace(match[0], '');
  }

  // Also strip <reason> tags
  text = text.replace(/<reason>[\s\S]*?<\/reason>/g, '');

  return { text: text.trim(), toolCalls };
}

/**
 * Truncate text for sending back as tool result context
 */
function truncateForContext(text) {
  const maxLen = 3000;
  if (!text || text.length <= maxLen) return text || '';
  return text.slice(0, maxLen) + `\n...[truncated, ${text.length - maxLen} chars omitted]`;
}

/**
 * Truncate text for display in terminal
 */
function truncateDisplay(text, maxLines = 200) {
  if (!text) return '';
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`;
}
