@echo off
set OPENAI_BASE_URL=https://openrouter.ai/api/v1
set OPENAI_API_KEY=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
set OPENAI_MODEL=qwen/qwen3.6-plus:free

echo Starting OpenClaude with OpenRouter API...
echo Model: %OPENAI_MODEL%
echo.

bun run dev:openai
pause
