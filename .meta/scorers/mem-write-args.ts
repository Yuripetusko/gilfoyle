/**
 * Parse a recorded `scripts/mem-write` call the way the script parses its own arguments,
 * so the memory scorers credit exactly the writes the script would accept.
 *
 * Leading options, in any order: `--org <name>`, `--project`, `--type <type>`,
 * `--tags <tags>`, `--pin`. Any other option is rejected, as is `--org` with `--project`.
 * Then `<category> <key> <content>`.
 */

export interface MemWriteArgs {
  category: string;
  key: string;
  content: string;
}

const VALID_TYPES = ['fact', 'pattern', 'query', 'incident', 'note'];
const VALUE_OPTIONS = ['--org', '--type', '--tags'];
const FLAG_OPTIONS = ['--project', '--pin'];

// One shell word: a quoted string or a run of non-space characters.
const WORD = /^("[^"]*"|'[^']*'|\S+)(?:\s+|$)/;

export function parseMemWriteInput(input: unknown): MemWriteArgs | null {
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const category = asString(obj.category);
    const key = asString(obj.key);
    const content = asString(obj.value ?? obj.content);
    if (category && key && content) {
      return { category, key, content };
    }
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const category = asString(parsed.category);
        const key = asString(parsed.key);
        const content = asString(parsed.value ?? parsed.content);
        if (category && key && content) {
          return { category, key, content };
        }
      } catch {
        // Fall back to CLI parser below.
      }
    }
    return parseMemWriteCliArgs(trimmed);
  }

  return null;
}

export function parseMemWriteCliArgs(input: string): MemWriteArgs | null {
  // `scripts/mem-write--project` is a typo the shell rejects, not a call.
  if (/^(?:bash\s+)?(?:\.\/)?scripts\/mem-write\S/.test(input)) return null;

  // Remove any leading script path (handles ./scripts/, bash scripts/, etc.)
  let rest = input.replace(/^(?:bash\s+)?(?:\.\/)?scripts\/mem-write\s*/, '').trim();

  let org = false;
  let project = false;
  // mem-write keeps overwriting TYPE and validates the last value once, after the loop.
  let type = 'fact';
  for (let word = rest.match(WORD); word; word = rest.match(WORD)) {
    const option = unquote(word[1]);
    if (!option.startsWith('-')) break;
    rest = rest.slice(word[0].length);

    if (FLAG_OPTIONS.includes(option)) {
      if (option === '--project') project = true;
      continue;
    }
    if (!VALUE_OPTIONS.includes(option)) return null; // mem-write: "Unknown option"

    const value = rest.match(WORD);
    if (!value) return null;
    rest = rest.slice(value[0].length);
    if (option === '--org') org = true;
    if (option === '--type') type = unquote(value[1]);
  }

  // mem-write: "Invalid type"
  if (!VALID_TYPES.includes(type)) return null;

  // mem-write: "--org and --project are mutually exclusive"
  if (org && project) return null;

  // Split into category, key, content
  // Format: <category> <key> <content>
  // Content may be quoted or contain spaces
  const parts = rest.match(/^(\S+)\s+("[^"]+"|'[^']+'|\S+)\s+(.+)/);
  if (!parts) {
    // Try simpler split
    const simpleParts = rest.split(/\s+/);
    if (simpleParts.length >= 3) {
      return {
        category: simpleParts[0],
        key: simpleParts[1].replace(/^["']|["']$/g, ''),
        content: simpleParts.slice(2).join(' '),
      };
    }
    return null;
  }

  return {
    category: parts[1],
    key: parts[2].replace(/^["']|["']$/g, ''),
    content: parts[3],
  };
}

function unquote(word: string): string {
  return word.replace(/^(["'])([\s\S]*)\1$/, '$2');
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
