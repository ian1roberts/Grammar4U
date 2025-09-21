# Coding Grammarly

A local writing assistant web application that provides grammar, clarity, and tone analysis for text. It combines fast local heuristics with optional OpenAI LLM integration for advanced suggestions, all running entirely on your device for privacy.

## Features

- **Grammar & Punctuation**: Detects repeated words, multiple spaces, and spelling preferences (e.g., British vs. American English).
- **Clarity**: Suggests improvements like Oxford comma usage.
- **Tone**: Identifies passive voice and other stylistic issues.
- **Rewrite Modes**: Simplify, formalize, or make text more friendly using local rules or LLM.
- **Local Heuristics**: Fast, offline analysis with no data sent externally.
- **Optional LLM Integration**: Enhance analysis with OpenAI models (GPT-4o, GPT-4o-mini, etc.) via a secure proxy server.
- **Privacy-Focused**: API key stays on your machine; text is processed locally or through your proxy.
- **Export & Copy**: Save drafts as Markdown or copy to clipboard.
- **Metrics**: Real-time word count, character count, reading time, and Flesch readability score.

## Installation

1. **Clone or Download**: Ensure you have the project files in a directory (e.g., `Grammar4U/`).
2. **Install Dependencies**:
   - Navigate to the `cg-proxy/` directory.
   - Run `npm install` to install Node.js dependencies (requires Node.js 16+).
3. **Configure Environment**:
   - In `cg-proxy/`, create or edit the `.env` file.
   - Add your OpenAI API key: `OPENAI_API_KEY=your_openai_api_key_here`.
   - Optionally, set `PORT=3333` (default) or `OPENAI_BASE=https://api.openai.com/v1` (default).
4. **Frontend**: No installation needed; open `index.html` in a modern web browser.

## Running the Application

1. **Start the Proxy Server**:
   - In `cg-proxy/`, run `npm start` or `node server.js`.
   - The server will start on `http://localhost:3333` (or your configured port).
2. **Open the Web App**:
   - Open `index.html` in your browser (e.g., double-click the file or use a local server).
   - Configure the endpoint in the app settings to point to `http://localhost:3333` if not default.
3. **Use the App**:
   - Paste or type text in the editor.
   - Press "Check" (or Ctrl+Enter) to analyze.
   - Toggle "Use OpenAI" for LLM-enhanced analysis.
   - Apply suggestions, rewrite, or export as needed.

## Configuration

### .env File in cg-proxy/
The proxy server requires an OpenAI API key to function with LLM features. Create a file named `.env` in the `cg-proxy/` directory with the following content:

```
OPENAI_API_KEY=sk-your-actual-openai-api-key-here
```

- Replace `sk-your-actual-openai-api-key-here` with your real OpenAI API key from [OpenAI's dashboard](https://platform.openai.com/api-keys).
- This key is used only by the local proxy server and is never sent to external services beyond OpenAI's API.
- If no key is provided, the app falls back to local heuristics only.

### Optional Environment Variables
- `PORT`: Server port (default: 3333).
- `OPENAI_BASE`: OpenAI API base URL (default: https://api.openai.com/v1).

## Usage Tips

- **Local Mode**: Uncheck "Use OpenAI" for fast, offline analysis.
- **LLM Mode**: Enable for deeper insights; ensure the proxy is running and API key is configured.
- **Model Selection**: Choose from available models (refreshes from API if configured).
- **Caching**: The app uses prompt caching to reduce API costs on repeated requests.
- **Troubleshooting**: Check browser console for errors; ensure CORS is allowed for local files.

## License

MIT License - See [LICENSE](LICENSE) for details.

## Author

Ian Roberts