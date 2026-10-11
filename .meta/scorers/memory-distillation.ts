import { Scorer } from 'axiom/ai/evals';
import type { EvalInput, EvalOutput, ToolCall } from '../harness/types.js';
import { parseMemWriteInput } from './mem-write-args.js';

/**
 * Memory Distillation Scorer (T11)
 *
 * Require mem-write calls across all three knowledge categories:
 *   - incidents (30%)
 *   - facts (30%)
 *   - queries (30%)
 * Bonus 10%: at least one saved query matches an actual axiom-query or
 * grafana-query tool call input.
 */

const QUERY_TOOLS = ['scripts/axiom-query', 'scripts/grafana-query'] as const;

export const MemoryDistillationScorer = Scorer<{
  input: EvalInput;
  output: EvalOutput;
  expected: { rootCause: string; evidence: string[] };
}>(
  'memory-distillation',
  ({ input, output }) => {
    const required = input.scenario.scoring?.requireMemoryDistillation ?? input.scenario.id !== 'first-run';
    if (!required) {
      return {
        score: 1,
        metadata: { applicable: false, note: 'Memory distillation not required for this scenario' },
      };
    }

    const toolCalls = output.trace.toolCalls;
    const memWriteCalls = toolCalls.filter((tc: ToolCall) => tc.tool === 'scripts/mem-write');

    if (memWriteCalls.length === 0) {
      return {
        score: 0,
        metadata: { applicable: true, note: 'No mem-write calls made', totalCalls: toolCalls.length },
      };
    }

    const categoriesFound = new Set<string>();
    const queryWrites: string[] = [];

    for (const tc of memWriteCalls) {
      const args = parseMemWriteInput(tc.input);
      if (!args) continue;

      const { category, content } = args;

      if (category === 'incidents') categoriesFound.add('incidents');
      if (category === 'facts') categoriesFound.add('facts');
      if (category === 'queries') {
        categoriesFound.add('queries');
        queryWrites.push(content);
      }
    }

    let score = 0;
    if (categoriesFound.has('incidents')) score += 0.3;
    if (categoriesFound.has('facts')) score += 0.3;
    if (categoriesFound.has('queries')) score += 0.3;

    // Bonus: check if any saved query matches an actual query tool call
    let queryMatchFound = false;
    if (queryWrites.length > 0) {
      const actualQueries = toolCalls
        .filter((tc: ToolCall) => (QUERY_TOOLS as readonly string[]).includes(tc.tool))
        .map((tc: ToolCall) => {
          const s = typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input);
          return normalize(s);
        });

      for (const saved of queryWrites) {
        const normalizedSaved = normalize(saved);
        if (normalizedSaved.length < 10) continue;
        for (const actual of actualQueries) {
          if (actual.includes(normalizedSaved) || normalizedSaved.includes(actual)) {
            queryMatchFound = true;
            break;
          }
        }
        if (queryMatchFound) break;
      }
    }

    if (queryMatchFound) score += 0.1;

    return {
      score: Math.min(1, score),
      metadata: {
        applicable: true,
        categoriesFound: [...categoriesFound],
        queryWrites: queryWrites.length,
        queryMatchFound,
        totalMemWriteCalls: memWriteCalls.length,
      },
    };
  }
);

function normalize(s: string): string {
  return s.toLowerCase().replace(/["']/g, '').replace(/\s+/g, ' ').trim();
}
