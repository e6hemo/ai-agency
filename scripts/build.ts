/**
 * OpenClaude build script — bundles the TypeScript source into a single
 * distributable JS file using Bun's bundler.
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { noTelemetryPlugin } from './no-telemetry-plugin'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const version = pkg.version

const STUB_CONTENTS = `
const noop = () => null;
const noopClass = class {};
const handler = {
  get(_, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'default') return new Proxy({}, handler);
    if (prop === 'ExportResultCode') return { SUCCESS: 0, FAILED: 1 };
    if (prop === 'resourceFromAttributes') return () => ({});
    if (prop === 'SandboxRuntimeConfigSchema') return { parse: () => ({}) };
    return noop;
  }
};
const stub = new Proxy(noop, handler);
export default stub;
export const __stub = true;
// Named exports
export const SandboxViolationStore = null;
export const SandboxManager = new Proxy({}, { get: () => noop });
export const SandboxRuntimeConfigSchema = { parse: () => ({}) };
export const BROWSER_TOOLS = [];
export const getMcpConfigForManifest = noop;
export const ColorDiff = null;
export const ColorFile = null;
export const getSyntaxTheme = noop;
export const plot = noop;
export const createClaudeForChromeMcpServer = noop;
// OpenTelemetry
export const ExportResultCode = { SUCCESS: 0, FAILED: 1 };
export const resourceFromAttributes = noop;
export const Resource = noopClass;
export const SimpleSpanProcessor = noopClass;
export const BatchSpanProcessor = noopClass;
export const NodeTracerProvider = noopClass;
export const BasicTracerProvider = noopClass;
export const OTLPTraceExporter = noopClass;
export const OTLPLogExporter = noopClass;
export const OTLPMetricExporter = noopClass;
export const PrometheusExporter = noopClass;
export const LoggerProvider = noopClass;
export const SimpleLogRecordProcessor = noopClass;
export const BatchLogRecordProcessor = noopClass;
export const MeterProvider = noopClass;
export const PeriodicExportingMetricReader = noopClass;
export const trace = { getTracer: () => ({ startSpan: () => ({ end: noop, setAttribute: noop, setStatus: noop, recordException: noop }) }) };
export const context = { active: noop, with: (_, fn) => fn() };
export const SpanStatusCode = { OK: 0, ERROR: 1, UNSET: 2 };
export const ATTR_SERVICE_NAME = 'service.name';
export const ATTR_SERVICE_VERSION = 'service.version';
export const SEMRESATTRS_SERVICE_NAME = 'service.name';
export const SEMRESATTRS_SERVICE_VERSION = 'service.version';
export const AggregationTemporality = { CUMULATIVE: 0, DELTA: 1 };
export const DataPointType = { HISTOGRAM: 0, SUM: 1, GAUGE: 2 };
export const InstrumentType = { COUNTER: 0, HISTOGRAM: 1, UP_DOWN_COUNTER: 2 };
export const PushMetricExporter = noopClass;
export const SeverityNumber = {};
`;

const missingStubsPlugin = {
  name: 'missing-stubs-catchall',
  setup(build: any) {
    build.onResolve({ filter: /^(@ant\/|@anthropic-ai\/mcpb|@anthropic-ai\/sandbox-runtime|electron|chromium-bidi\/)/ }, (args: any) => ({
      path: args.path,
      namespace: 'missing-stubs-catchall',
    }))
    build.onLoad({ filter: /.*/, namespace: 'missing-stubs-catchall' }, () => ({
      contents: STUB_CONTENTS,
      loader: 'js',
    }))
  }
};

const bunBundleShimPlugin = {
  name: 'bun-bundle-shim',
  setup(build: any) {
    const internalFeatureStubModules = new Map([
      ['../daemon/workerRegistry.js', 'export async function runDaemonWorker() { throw new Error("Daemon worker forbidden"); }'],
      ['../daemon/main.js', 'export async function daemonMain() { throw new Error("Daemon forbidden"); }'],
      ['../cli/bg.js', 'export async function psHandler() { throw new Error("BG forbidden"); } export async function logsHandler() { throw new Error("BG forbidden"); } export async function attachHandler() { throw new Error("BG forbidden"); } export async function killHandler() { throw new Error("BG forbidden"); } export async function handleBgFlag() { throw new Error("BG forbidden"); }'],
      ['../cli/handlers/templateJobs.js', 'export async function templatesMain() { throw new Error("Templates forbidden"); }'],
      ['../environment-runner/main.js', 'export async function environmentRunnerMain() { throw new Error("EnvRunner forbidden"); }'],
      ['../self-hosted-runner/main.js', 'export async function selfHostedRunnerMain() { throw new Error("SelfHostedRunner forbidden"); }'],
    ]);

    build.onResolve({ filter: /^bun:bundle$/ }, () => ({ path: 'bun:bundle', namespace: 'bun-bundle-shim' }));
    build.onLoad({ filter: /.*/, namespace: 'bun-bundle-shim' }, () => ({ contents: `export function feature(name) { return false; }`, loader: 'js' }));

    build.onResolve({ filter: /^\.\.\/(daemon\/workerRegistry|daemon\/main|cli\/bg|cli\/handlers\/templateJobs|environment-runner\/main|self-hosted-runner\/main)\.js$/ }, (args: any) => {
      if (!internalFeatureStubModules.has(args.path)) return null;
      return { path: args.path, namespace: 'internal-feature-stub' };
    });
    build.onLoad({ filter: /.*/, namespace: 'internal-feature-stub' }, (args: any) => ({ contents: internalFeatureStubModules.get(args.path) ?? 'export {}', loader: 'js' }));

    build.onResolve({ filter: /^react\/compiler-runtime$/ }, () => ({ path: 'react/compiler-runtime', namespace: 'react-compiler-shim' }));
    build.onLoad({ filter: /.*/, namespace: 'react-compiler-shim' }, () => ({ contents: `export function c(size) { return new Array(size).fill(Symbol.for('react.memo_cache_sentinel')); }`, loader: 'js' }));

    const nativeMods = [
      'audio-capture-napi', 'audio-capture.node', 'image-processor-napi', 'modifiers-napi', 'url-handler-napi',
      'color-diff-napi', '@anthropic-ai/mcpb', '@ant/claude-for-chrome-mcp', '@anthropic-ai/sandbox-runtime',
      'asciichart', 'plist', 'cacache', 'fuse', 'code-excerpt', 'stack-utils', 'electron',
      'chromium-bidi/lib/cjs/bidiMapper/BidiMapper', 'chromium-bidi/lib/cjs/cdp/CdpConnection',
    ];
    for (const mod of nativeMods) {
      build.onResolve({ filter: new RegExp(`^${mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }, () => ({ path: mod, namespace: 'native-stub' }));
    }
    build.onLoad({ filter: /.*/, namespace: 'native-stub' }, () => ({ contents: STUB_CONTENTS, loader: 'js' }));

    build.onResolve({ filter: /\.(md|txt)$/ }, (args: any) => ({ path: args.path, namespace: 'text-stub' }));
    build.onLoad({ filter: /.*/, namespace: 'text-stub' }, () => ({ contents: `export default '';`, loader: 'js' }));

    // Scanner for missing modules
    const srcDir = resolve(__dirname, '..', 'src');
    const missingModules = new Set<string>();
    const missingModuleExports = new Map<string, Set<string>>();

    for (const pkg of ['@ant/computer-use-mcp', 'electron', 'chromium-bidi/lib/cjs/bidiMapper/BidiMapper']) {
      missingModules.add(pkg);
    }

    function walk(dir: string) {
      if (!existsSync(dir)) return;
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, ent.name);
        if (ent.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx)$/.test(ent.name)) continue;
        const code = readFileSync(full, 'utf-8');
        for (const m of code.matchAll(/import\s+(?:\{([^}]*)\}|(\w+))?\s*(?:,\s*\{([^}]*)\})?\s*from\s+['"](.*?)['"]/g)) {
          const specifier = m[4];
          const names = (m[1] || m[3] || '').split(',').map(s => s.trim().replace(/^type\s+/, '')).filter(s => s && !s.startsWith('type '));
          if (names.length > 0) {
            if (!missingModuleExports.has(specifier)) missingModuleExports.set(specifier, new Set());
            for (const n of names) missingModuleExports.get(specifier)!.add(n);
          }
        }
      }
    }
    walk(srcDir);

    for (const mod of missingModules) {
      build.onResolve({ filter: new RegExp(`^${mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }, () => ({ path: mod, namespace: 'missing-module-stub' }));
    }
    build.onLoad({ filter: /.*/, namespace: 'missing-module-stub' }, (args: any) => {
      const names = missingModuleExports.get(args.path) ?? new Set();
      const exports = [...names].map(n => `export const ${n} = noop;`).join('\n');
      return { contents: `const noop = () => null; export default noop; ${exports}`, loader: 'js' };
    });
  }
};

const commonPlugins = [
  noTelemetryPlugin,
  missingStubsPlugin,
  bunBundleShimPlugin
];

const sharedExternal = [
  '@opentelemetry/api', '@opentelemetry/api-logs', '@opentelemetry/core', '@opentelemetry/exporter-trace-otlp-grpc',
  '@opentelemetry/exporter-trace-otlp-http', '@opentelemetry/exporter-trace-otlp-proto', '@opentelemetry/exporter-logs-otlp-http',
  '@opentelemetry/exporter-logs-otlp-proto', '@opentelemetry/exporter-logs-otlp-grpc', '@opentelemetry/exporter-metrics-otlp-proto',
  '@opentelemetry/exporter-metrics-otlp-grpc', '@opentelemetry/exporter-metrics-otlp-http', '@opentelemetry/exporter-prometheus',
  '@opentelemetry/resources', '@opentelemetry/sdk-trace-base', '@opentelemetry/sdk-trace-node', '@opentelemetry/sdk-logs',
  '@opentelemetry/sdk-metrics', '@opentelemetry/semantic-conventions', 'sharp', '@aws-sdk/client-bedrock',
  '@aws-sdk/client-bedrock-runtime', '@aws-sdk/client-sts', '@aws-sdk/credential-providers', '@azure/identity',
  'google-auth-library', 'playwright-chromium', 'playwright-core', 'better-sqlite3', '@anthropic-ai/sdk'
];

const commonDefine = {
  'MACRO.VERSION': JSON.stringify('99.0.0'),
  'MACRO.DISPLAY_VERSION': JSON.stringify(version),
  'MACRO.BUILD_TIME': JSON.stringify(new Date().toISOString()),
  'MACRO.ISSUES_EXPLAINER': JSON.stringify('report issues at https://github.com/anthropics/claude-code/issues'),
  'MACRO.PACKAGE_URL': JSON.stringify('@gitlawb/openclaude'),
  'MACRO.NATIVE_PACKAGE_URL': 'undefined',
};

// --- Build CLI ---
const result = await Bun.build({
  entrypoints: ['./src/entrypoints/cli.tsx'],
  outdir: './dist',
  target: 'node',
  format: 'esm',
  naming: 'cli.mjs',
  define: commonDefine,
  plugins: commonPlugins,
  external: sharedExternal,
});

// --- Build Bot ---
const resultBot = await Bun.build({
  entrypoints: ['./src/telegram/entrypoint.ts'],
  outdir: './dist',
  target: 'node',
  format: 'esm',
  naming: 'telegram-bot.mjs',
  define: commonDefine,
  external: ['better-sqlite3', 'sharp'],
});

// --- Build Server ---
const resultServer = await Bun.build({
  entrypoints: ['./src/server.ts'],
  outdir: './dist',
  target: 'node',
  format: 'esm',
  naming: 'server.mjs',
  define: commonDefine,
  plugins: commonPlugins,
  external: [...sharedExternal, 'express', 'cors', 'socket.io'],
});

if (!result.success || !resultBot.success || !resultServer.success) {
  console.error('Build failed:');
  if (!result.success) result.logs.forEach(l => console.error(l));
  if (!resultBot.success) resultBot.logs.forEach(l => console.error(l));
  if (!resultServer.success) resultServer.logs.forEach(l => console.error(l));
  process.exit(1);
}

console.log(`✓ Built openclaude v${version} → dist/cli.mjs, dist/telegram-bot.mjs, dist/server.mjs`);
