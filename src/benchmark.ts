import https from 'node:https';
import { ReactASTCompressor } from './compressor.js';
import type { BenchmarkSource, BenchmarkResult } from './types.js';

const SOURCES: BenchmarkSource[] = [
  {
    repo: 'facebook/react',
    file: 'InspectedElement.js',
    url: 'https://raw.githubusercontent.com/facebook/react/main/packages/react-devtools-shared/src/devtools/views/Components/InspectedElement.js',
  },
  {
    repo: 'facebook/react',
    file: 'Element.js',
    url: 'https://raw.githubusercontent.com/facebook/react/main/packages/react-devtools-shared/src/devtools/views/Components/Element.js',
  },
  {
    repo: 'mui/material-ui',
    file: 'Button.js',
    url: 'https://raw.githubusercontent.com/mui/material-ui/master/packages/mui-material/src/Button/Button.js',
  },
  {
    repo: 'vercel/next.js',
    file: 'error-boundary.tsx',
    url: 'https://raw.githubusercontent.com/vercel/next.js/canary/packages/next/src/client/components/error-boundary.tsx',
  },
  {
    repo: 'ant-design/ant-design',
    file: 'Table.tsx',
    url: 'https://raw.githubusercontent.com/ant-design/ant-design/master/components/table/Table.tsx',
  },
  {
    repo: 'tailwindlabs/headlessui',
    file: 'combobox.tsx',
    url: 'https://raw.githubusercontent.com/tailwindlabs/headlessui/main/packages/%40headlessui-react/src/components/combobox/combobox.tsx',
  },
  {
    repo: 'storybookjs/storybook',
    file: 'Tree.tsx',
    url: 'https://raw.githubusercontent.com/storybookjs/storybook/next/code/core/src/manager/components/sidebar/Tree.tsx',
  },
  {
    repo: 'jitsi/jitsi-meet',
    file: 'Toolbox.tsx',
    url: 'https://raw.githubusercontent.com/jitsi/jitsi-meet/master/react/features/toolbox/components/web/Toolbox.tsx',
  },
  {
    repo: 'supabase/supabase',
    file: 'SQLEditor.tsx',
    url: 'https://raw.githubusercontent.com/supabase/supabase/master/apps/studio/components/interfaces/SQLEditor/SQLEditor.tsx',
  },
  {
    repo: 'preactjs/preact',
    file: 'component.js',
    url: 'https://raw.githubusercontent.com/preactjs/preact/main/src/component.js',
  },
];

function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const makeRequest = (targetUrl: string): void => {
      https
        .get(targetUrl, { headers: { 'User-Agent': 'node' } }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            makeRequest(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${targetUrl}`));
            return;
          }
          let data = '';
          res.on('data', (chunk: Buffer) => (data += chunk.toString()));
          res.on('end', () => resolve(data));
          res.on('error', reject);
        })
        .on('error', reject);
    };
    makeRequest(url);
  });
}

async function run(): Promise<void> {
  const compressor = new ReactASTCompressor();
  const results: BenchmarkResult[] = [];
  let totalOriginal = 0;
  let totalCompressed = 0;

  console.log('Fetching and compressing components from top public repos...\n');

  for (const source of SOURCES) {
    const label = `${source.repo} / ${source.file}`;
    process.stdout.write(`  ${label} ... `);

    try {
      const code = await fetchUrl(source.url);
      const lines = code.split('\n').length;

      const start = performance.now();
      const result = compressor.compress(code);
      const elapsed = (performance.now() - start).toFixed(1);

      totalOriginal += result.originalTokens;
      totalCompressed += result.compressedTokens;

      results.push({
        repo: source.repo,
        file: source.file,
        lines,
        originalTokens: result.originalTokens,
        compressedTokens: result.compressedTokens,
        savingsPercent: result.savingsPercent,
        timeMs: elapsed,
        status: 'ok',
      });

      console.log(
        `${result.originalTokens} → ${result.compressedTokens} tokens ` +
          `(${result.savingsPercent}% saved) [${elapsed}ms, ${lines} lines]`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        repo: source.repo,
        file: source.file,
        lines: 0,
        originalTokens: 0,
        compressedTokens: 0,
        savingsPercent: 0,
        timeMs: '0',
        status: `FAIL: ${message}`,
      });
      console.log(`FAILED: ${message}`);
    }
  }

  const successResults = results.filter((r) => r.status === 'ok');
  const totalSavings =
    totalOriginal > 0
      ? Math.round(((totalOriginal - totalCompressed) / totalOriginal) * 100)
      : 0;

  const avgSavings =
    successResults.length > 0
      ? Math.round(
          successResults.reduce((sum, r) => sum + r.savingsPercent, 0) / successResults.length,
        )
      : 0;

  const avgTime =
    successResults.length > 0
      ? (
          successResults.reduce((sum, r) => sum + parseFloat(r.timeMs), 0) / successResults.length
        ).toFixed(1)
      : '0';

  console.log('\n' + '='.repeat(80));
  console.log('BENCHMARK RESULTS — AST Compression on Top Public React Repos');
  console.log('='.repeat(80));
  console.log('');

  console.log(
    'Repo'.padEnd(28) +
      'File'.padEnd(24) +
      'Lines'.padStart(6) +
      'Original'.padStart(10) +
      'Compressed'.padStart(12) +
      'Saved'.padStart(8) +
      'Time'.padStart(8),
  );
  console.log('-'.repeat(96));

  for (const r of results) {
    if (r.status !== 'ok') {
      console.log(`${r.repo.padEnd(28)}${r.file.padEnd(24)}  ${r.status}`);
      continue;
    }
    console.log(
      r.repo.padEnd(28) +
        r.file.padEnd(24) +
        String(r.lines).padStart(6) +
        String(r.originalTokens).padStart(10) +
        String(r.compressedTokens).padStart(12) +
        `${r.savingsPercent}%`.padStart(8) +
        `${r.timeMs}ms`.padStart(8),
    );
  }

  console.log('-'.repeat(96));
  console.log(
    'TOTAL'.padEnd(28) +
      `${successResults.length} files`.padEnd(24) +
      String(successResults.reduce((s, r) => s + r.lines, 0)).padStart(6) +
      String(totalOriginal).padStart(10) +
      String(totalCompressed).padStart(12) +
      `${totalSavings}%`.padStart(8) +
      `${avgTime}ms`.padStart(8),
  );
  console.log('');
  console.log(`Average savings per file:  ${avgSavings}%`);
  console.log(`Average compression time:  ${avgTime}ms`);
  console.log(`Total tokens saved:        ${totalOriginal - totalCompressed}`);
  console.log('');

  const costPer1MTokens = 3.0;
  const savedPer1KCalls = (
    ((totalOriginal - totalCompressed) / successResults.length) *
    1000 *
    (costPer1MTokens / 1_000_000)
  ).toFixed(2);
  console.log(
    `Estimated cost savings:    ~$${savedPer1KCalls} per 1K calls (at $${costPer1MTokens}/1M tokens)`,
  );
  console.log('');
}

run().catch(console.error);
