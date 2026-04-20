export const SEMANTIC_SEARCH_TOOL_NAME = 'SemanticSearch'

export const DESCRIPTION = `Search the codebase conceptually using natural language queries to find relevant implementation chunks.
Unlike Grep which requires exact matches, this tool performs a hybrid fuzzy/semantic search across the workspace.
Use this tool when you want to answer questions like:
- "Where is the user authentication logic implemented?"
- "How do we handle API rate limits?"
- "Find the data models for the database"

Provide a descriptive natural language query. The tool returns snippets of code along with their file paths, allowing you to discover codebase context without opening the entire project.`
