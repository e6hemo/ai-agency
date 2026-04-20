const vscode = require('vscode');
const http = require('http');

class GhostTextProvider {
  constructor() {
    this.port = vscode.workspace.getConfiguration('openclaude').get('apiPort', 3000);
  }

  async provideInlineCompletionItems(document, position, context, token) {
    const textBeforeCursor = document.getText(
      new vscode.Range(new vscode.Position(0, 0), position)
    );
    const textAfterCursor = document.getText(
      new vscode.Range(position, new vscode.Position(document.lineCount, 0))
    );

    try {
      const completion = await this._fetchCompletion(textBeforeCursor, textAfterCursor);
      if (completion && completion.trim().length > 0) {
        return [
          {
            insertText: completion,
            range: new vscode.Range(position, position),
          }
        ];
      }
    } catch (err) {
      // Ignore network errors (OpenClaude agency might be disabled or offline)
    }

    return [];
  }

  _fetchCompletion(prefix, suffix) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: this.port,
        path: '/api/lsp/autocomplete',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const json = JSON.parse(data);
              resolve(json.completion || '');
            } catch (e) {
              resolve('');
            }
          } else {
            resolve('');
          }
        });
      });

      req.on('error', reject);
      req.write(JSON.stringify({ prefix, suffix }));
      req.end();
    });
  }
}

module.exports = { GhostTextProvider };
