import * as fs from 'fs'
import * as path from 'path'
import { getOriginalCwd } from '../bootstrap/state.js'

export interface GraphNode {
  id: string
  filePath: string
  entities: string[]
  dependencies: string[]
}

export interface KnowledgeGraph {
  projectName: string
  timestamp: string
  nodes: GraphNode[]
}

class ProjectAnalyzer {
  private visited = new Set<string>()

  public analyze(projectName: string): KnowledgeGraph {
    const cwd = getOriginalCwd()
    
    // For now we assume the target project is the user workspace itself (or a sub-folder)
    // In OpenClaude, generally the workspace is the target.
    // We'll scan `src` directory or current directory if no src exists.
    let targetDir = path.join(cwd, 'src')
    if (!fs.existsSync(targetDir)) {
      targetDir = cwd
    }

    this.visited.clear()
    const nodes: GraphNode[] = []

    this.scanDirectory(targetDir, cwd, nodes)

    const graph: KnowledgeGraph = {
      projectName,
      timestamp: new Date().toISOString(),
      nodes
    }

    const agencyDir = path.join(cwd, '.claude', 'agency', 'projects', projectName)
    if (!fs.existsSync(agencyDir)) {
      fs.mkdirSync(agencyDir, { recursive: true })
    }
    fs.writeFileSync(path.join(agencyDir, 'graph.json'), JSON.stringify(graph, null, 2))

    // Generate Markdown report
    this.generateMarkdownReport(graph, agencyDir)

    return graph
  }

  private scanDirectory(dir: string, baseCwd: string, nodes: GraphNode[]) {
    const items = fs.readdirSync(dir, { withFileTypes: true })
    
    for (const item of items) {
      if (['node_modules', '.git', '.claude', 'dist', 'build'].includes(item.name)) continue
      
      const fullPath = path.join(dir, item.name)
      if (item.isDirectory()) {
        this.scanDirectory(fullPath, baseCwd, nodes)
      } else if (item.isFile() && /\.(ts|js|jsx|tsx)$/.test(item.name)) {
        const node = this.analyzeFile(fullPath, baseCwd)
        if (node) nodes.push(node)
      }
    }
  }

  private analyzeFile(filePath: string, baseCwd: string): GraphNode | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const relPath = path.relative(baseCwd, filePath).replace(/\\/g, '/')
      
      const entities: string[] = []
      const dependencies: string[] = []

      // Extract classes
      const classMatches = content.matchAll(/class\s+([A-Za-z0-9_]+)/g)
      for (const match of classMatches) entities.push(`Class:${match[1]}`)

      // Extract functions
      const fnMatches = content.matchAll(/function\s+([A-Za-z0-9_]+)/g)
      for (const match of fnMatches) entities.push(`Function:${match[1]}`)

      // Extract const arrows
      const constMatches = content.matchAll(/const\s+([A-Za-z0-9_]+)\s*=\s*(?:\([^)]*\)|[^=]+)\s*=>/g)
      for (const match of constMatches) entities.push(`ArrowFn:${match[1]}`)
      
      // Extract imports (dependencies)
      const importMatches = content.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g)
      for (const match of importMatches) {
        if (!match[1].startsWith('.')) {
          // external modules
          dependencies.push(`ext:${match[1]}`)
        } else {
          // local files, try to normalize
          const resolved = path.resolve(path.dirname(filePath), match[1])
          const relative = path.relative(baseCwd, resolved).replace(/\\/g, '/')
          dependencies.push(relative)
        }
      }

      return {
        id: relPath,
        filePath: relPath,
        entities,
        dependencies: Array.from(new Set(dependencies))
      }

    } catch {
      return null
    }
  }

  private generateMarkdownReport(graph: KnowledgeGraph, outDir: string) {
    let md = `# 🕸️ Knowledge Graph Report: ${graph.projectName}\n\n`
    md += `*Generated: ${new Date(graph.timestamp).toLocaleString('ar-SA')}*\n\n`
    md += `## نظرة عامة على الملفات الهامة وعلاقاتها\n\n`

    for (const node of graph.nodes) {
      if (node.entities.length === 0 && node.dependencies.length === 0) continue

      md += `### 📄 \`${node.filePath}\`\n`
      if (node.entities.length > 0) {
        md += `- **الكائنات المعرفة:** ${node.entities.join(', ')}\n`
      }
      if (node.dependencies.length > 0) {
        md += `- **يعتمد على:**\n`
        node.dependencies.forEach(d => {
          md += `  - \`${d}\`\n`
        })
      }
      md += '\n'
    }

    fs.writeFileSync(path.join(outDir, 'GRAPH_REPORT.md'), md)
  }
}

export const projectAnalyzer = new ProjectAnalyzer()
