export const BROWSER_TOOL_NAME = 'BrowserTool'

export const DESCRIPTION = `Use a native headless browser (Chromium) to navigate and interact with web pages.
This tool is significantly more powerful than WebFetch for JavaScript-heavy applications like React/Vue docs or interactive portals.

Available actions:
- "navigate": Go to a specific URL and return the fully-rendered content.
- "screenshot": Take a screenshot of the current page.
- "execute_js": Run a snippet of JavaScript on the current page to extract specific data or interact with elements.
- "get_content": Re-extract the page content if the DOM has changed (e.g. after clicking or executing JS).

You should prefer BrowserTool over WebFetchTool when:
1. WebFetchTool returns empty or incomplete content.
2. The site is known to be a modern SPA (Single Page App).
3. You specifically need to wait for elements to load or execute scripts.
`
