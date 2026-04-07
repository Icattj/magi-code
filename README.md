# 🐱 MAGI Code

AI coding agent for your terminal — powered by the MAGI Council.

```
   /\_/\
  ( o.o )
   > ^ <
  /|   |\
 (_|   |_)  MAGI Code
```

## Quick Start

```bash
# Install
cd magi-code && npm install

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Run
node src/index.js

# Or with options
node src/index.js --agent rafael --resume
```

## Features

- 🐱 Cat mascot welcome screen
- 🧭 Multiple AI agents (Rafael, Uriel, Michael, Gabriel, Raguel, MAGI)
- 📁 File reading, writing, and editing with undo
- 🔍 Codebase search and exploration
- 💻 Shell command execution with confirmation
- 📝 Session management with resume
- 🎨 Beautiful bordered TUI with colors

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/agent <name>` | Switch agent |
| `/agents` | List available agents |
| `/panel <question>` | Multi-agent roundtable |
| `/context` | Show files in context |
| `/undo` | Revert last file change |
| `/clear` | Clear chat history |
| `/compact` | Compress old messages |
| `/resume` | Resume last session |
| `/exit` | Quit |

## Keyboard Shortcuts

- **Enter** — Send message
- **Ctrl+C** — Cancel current response
- **Ctrl+D** — Exit
- **↑↓** — Command history

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key | (required) |
| `MAGI_MODEL` | Model to use | `claude-sonnet-4-20250514` |
| `MAGI_API_URL` | Custom API endpoint | `https://api.anthropic.com/v1/messages` |

## Architecture

```
src/
├── index.js    — Entry point, input loop, command handling
├── ui.js       — Terminal UI rendering (boxes, colors, layout)
├── agent.js    — AI API communication with streaming
├── tools.js    — Tool implementations (read, write, edit, run, search)
├── session.js  — Session persistence and management
├── config.js   — Configuration loading and project detection
└── context.js  — Codebase context building and file tree
```
