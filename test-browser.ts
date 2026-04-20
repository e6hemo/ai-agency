import { BrowserTool } from './src/tools/BrowserTool/BrowserTool.js'

async function run() {
  const abortController = new AbortController()

  const result1 = await BrowserTool.call({
    action: 'navigate',
    url: 'https://react.dev'
  }, {
    abortController,
    options: { isNonInteractiveSession: true }
  })
  
  console.log("NAVIGATE RESULT:")
  console.log(result1)

  const result2 = await BrowserTool.call({
    action: 'execute_js',
    script: 'document.title'
  }, {
    abortController,
    options: { isNonInteractiveSession: true }
  })

  console.log("JS EXECUTE RESULT:")
  console.log(result2)

  process.exit(0)
}

run().catch(console.error)
