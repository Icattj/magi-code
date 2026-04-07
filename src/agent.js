/**
 * MAGI Code — AI Agent Communication
 * Handles API calls with streaming and tool call parsing
 */
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { getSystemPrompt } from './config.js';
import { executeTool, needsConfirmation } from './tools.js';
import {
  renderResponseStart, renderResponseEnd, renderResponseLine,
  renderToolCall, renderToolResult, renderDiff, renderError, colors,
} from './ui.js';
import ora from 'ora';

/**
 * Send a message to the AI and handle the response with streaming
 */
export async function sendMessage(config, session, userMessage, { onToolConfirm }) {
  const agentInfo = config.agents[config.agent] || config.agents.magi;
  
  // Add user message to session
  session.addMessage('user', userMessage);

  // Build messages for API
  const systemPrompt = getSystemPrompt(config);
  const apiMessages = session.getApiMessages();

  // Start response display
  renderResponseStart(agentInfo.name, agentInfo.emoji);

  let fullResponse = '';
  
  try {
    fullResponse = await streamCompletion(config, systemPrompt, apiMessages);
  } catch (err) {
    renderResponseLine(colors.error(`API Error: ${err.message}`));
    renderResponseEnd();
    
    if (err.message.includes('API key')) {
      console.log(colors.warning('\n  Set your API key:'));
      console.log(colors.dim('  export MAGI_API_KEY=sk-ant-...\n'));
    }
    return;
  }

  // Parse and handle tool calls
  const { text, toolCalls } = parseResponse(fullResponse);

  // Display text portion
  if (text.trim()) {
    renderResponseLine(text.trim());
  }

  // Handle tool calls
  if (toolCalls.length > 0) {
    for (const tc of toolCalls) {
      console.log(renderToolCall(tc.name, tc.args));
      
      // Ask for confirmation if needed
      if (needsConfirmation(tc.name)) {
        const confirmed = await onToolConfirm(tc.name, tc.args);
        if (!confirmed) {
          console.log(renderToolResult(tc.name, 'Skipped by user', false));
          continue;
        }
      }

      // Execute tool
      const spinner = ora({
        text: colors.dim(`Running ${tc.name}...`),
        spinner: 'dots',
        color: 'cyan',
      }).start();

      try {
        const result = await executeTool(tc.name, tc.args);
        spinner.stop();

        // Track context
        if (tc.name === 'read_file' && tc.args.path) {
          session.addToContext(tc.args.path);
        }

        console.log(renderToolResult(tc.name, result, true));

        // For edit_file, show diff
        if (tc.name === 'edit_file' && tc.args.old_text && tc.args.new_text) {
          console.log(renderDiff(tc.args.path, tc.args.old_text, tc.args.new_text));
        }

        // Feed result back for continuation
        session.addMessage('assistant', fullResponse);
        session.addMessage('user', `[Tool result for ${tc.name}]: ${truncateForContext(result)}`);

        // Get follow-up response
        const followUp = await streamCompletion(config, systemPrompt, session.getApiMessages());
        const { text: followText, toolCalls: moreTools } = parseResponse(followUp);
        
        if (followText.trim()) {
          renderResponseLine('');
          renderResponseLine(followText.trim());
        }

        if (moreTools.length > 0) {
          // Recursive tool handling (max depth handled by API token limits)
          for (const ftc of moreTools) {
            console.log(renderToolCall(ftc.name, ftc.args));
            
            if (needsConfirmation(ftc.name)) {
              const conf = await onToolConfirm(ftc.name, ftc.args);
              if (!conf) {
                console.log(renderToolResult(ftc.name, 'Skipped by user', false));
                continue;
              }
            }

            const fSpinner = ora({
              text: colors.dim(`Running ${ftc.name}...`),
              spinner: 'dots',
              color: 'cyan',
            }).start();

            try {
              const fResult = await executeTool(ftc.name, ftc.args);
              fSpinner.stop();
              console.log(renderToolResult(ftc.name, fResult, true));
              
              if (ftc.name === 'read_file' && ftc.args.path) {
                session.addToContext(ftc.args.path);
              }
            } catch (fErr) {
              fSpinner.fail(colors.error(fErr.message));
              console.log(renderToolResult(ftc.name, fErr.message, false));
            }
          }

          session.addMessage('assistant', followUp);
        } else {
          session.addMessage('assistant', followUp);
        }
      } catch (err) {
        spinner.fail(colors.error(err.message));
        console.log(renderToolResult(tc.name, err.message, false));
      }
    }
  } else {
    session.addMessage('assistant', fullResponse);
  }

  renderResponseEnd();
  session.save();
}

/**
 * Stream a completion from the Anthropic API
 */
function streamCompletion(config, systemPrompt, messages) {
  return new Promise((resolve, reject) => {
    if (!config.apiKey) {
      reject(new Error('No API key configured. Set MAGI_API_KEY environment variable.'));
      return;
    }

    const url = new URL(config.apiUrl);

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ];
    const body = JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      messages: apiMessages,
      stream: true,
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.apiKey,
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
            reject(new Error(`API returned ${res.statusCode}: ${errorBody.slice(0, 200)}`));
          }
        });
        return;
      }

      let fullText = '';
      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        
        // Process SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);
              
              // OpenAI format
              const delta = event.choices?.[0]?.delta;
              if (delta?.content) {
                fullText += delta.content;
                process.stdout.write(colors.dim(delta.content));
              }
            } catch {
              // Skip malformed events
            }
          }
        }
      });

      res.on('end', () => {
        process.stdout.write('\n');
        resolve(fullText);
      });

      res.on('error', reject);
    });

    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        reject(new Error(`Cannot connect to API at ${config.apiUrl}`));
      } else {
        reject(err);
      }
    });

    req.write(body);
    req.end();
  });
}

/**
 * Parse tool calls from response text
 * Format: <tool_call name="tool_name"><param name="key">value</param></tool_call>
 */
function parseResponse(responseText) {
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
      args[paramMatch[1]] = paramMatch[2];
    }

    toolCalls.push({ name: toolName, args });
    
    // Remove tool call from display text
    text = text.replace(match[0], '');
  }

  // Also remove <reason> tags from display
  text = text.replace(/<reason>[\s\S]*?<\/reason>/g, '');

  return { text: text.trim(), toolCalls };
}

function truncateForContext(text) {
  const maxLen = 2000;
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + `\n...[truncated, ${text.length - maxLen} chars omitted]`;
}
