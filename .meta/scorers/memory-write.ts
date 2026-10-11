import { Scorer } from 'axiom/ai/evals';
import type { EvalInput, EvalOutput, ToolCall } from '../harness/types.js';
import { parseMemWriteInput } from './mem-write-args.js';

/**
 * Memory Write Scorer (T03)
 *
 * Require ≥1 `scripts/mem-write` call. Validate category is one of
 * {facts, patterns, queries, incidents} and content length > 20 chars.
 * Bonus: at least one write before the final tool call.
 */

const VALID_CATEGORIES = ['facts', 'patterns', 'queries', 'incidents'];

export const MemoryWriteScorer = Scorer<{
  input: EvalInput;
  output: EvalOutput;
  expected: { rootCause: string; evidence: string[] };
}>(
  'memory-write',
  ({ input, output }) => {
    const required = input.scenario.scoring?.requireMemoryWrite ?? input.scenario.id !== 'first-run';
    if (!required) {
      return {
        score: 1,
        metadata: { applicable: false, note: 'Memory-write not required for this scenario' },
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

    // Parse mem-write calls to check category and content
    // Format: scripts/mem-write [options] <category> <key> <content>, options parsed as mem-write does
    const validWrites: { category: string; key: string; contentLength: number }[] = [];
    const invalidWrites: { input: string; reason: string }[] = [];

    for (const tc of memWriteCalls) {
      const inputStr = typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input);
      const args = parseMemWriteInput(tc.input);
      if (!args) {
        invalidWrites.push({ input: inputStr.slice(0, 100), reason: 'Could not parse arguments' });
        continue;
      }

      const { category, key, content } = args;

      if (!VALID_CATEGORIES.includes(category)) {
        invalidWrites.push({
          input: inputStr.slice(0, 100),
          reason: `Invalid category '${category}'. Valid: ${VALID_CATEGORIES.join(', ')}`,
        });
        continue;
      }

      if (content.length < 20) {
        invalidWrites.push({
          input: inputStr.slice(0, 100),
          reason: `Content too short (${content.length} chars, need > 20)`,
        });
        continue;
      }

      validWrites.push({ category, key, contentLength: content.length });
    }

    if (validWrites.length === 0) {
      return {
        score: 0,
        metadata: {
          applicable: true,
          note: 'No valid mem-write calls',
          invalidWrites,
          totalMemWriteCalls: memWriteCalls.length,
        },
      };
    }

    // Check if at least one write happened before the last tool call
    const lastToolIndex = toolCalls.length - 1;
    const memWriteIndices = toolCalls
      .map((tc: ToolCall, i: number) => (tc.tool === 'scripts/mem-write' ? i : -1))
      .filter((i: number) => i >= 0);
    const hasWriteBeforeLast = memWriteIndices.some((i: number) => i < lastToolIndex);

    // Score: 70% for having valid writes, 30% bonus for writing before end
    const baseScore = 0.7;
    const bonusScore = hasWriteBeforeLast ? 0.3 : 0;
    const score = baseScore + bonusScore;

    return {
      score,
      metadata: {
        applicable: true,
        validWrites,
        invalidWrites,
        hasWriteBeforeLast,
        totalMemWriteCalls: memWriteCalls.length,
      },
    };
  }
);
