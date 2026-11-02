export type CellValue = string | number;

export const columnName = (index: number) => {
  let name = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
};

const columnIndex = (letters: string) => letters.split('').reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export const parseRef = (ref: string): { row: number; col: number } | null => {
  const match = /^\$?([A-Z]{1,3})\$?(\d{1,5})$/.exec(ref.toUpperCase());
  if (!match) return null;
  return { col: columnIndex(match[1]), row: Number(match[2]) - 1 };
};

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ref'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string };

const tokenize = (input: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      tokens.push({ t: 'num', v: Number(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let value = '';
      while (j < input.length && input[j] !== '"') value += input[j++];
      if (input[j] !== '"') throw new Error('#PARSE');
      tokens.push({ t: 'str', v: value });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z$_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9$_.]/.test(input[j])) j++;
      const word = input.slice(i, j);
      if (input[j] === '(') tokens.push({ t: 'id', v: word.toUpperCase() });
      else if (parseRef(word)) tokens.push({ t: 'ref', v: word.toUpperCase().replace(/\$/g, '') });
      else if (/^(TRUE|FALSE)$/i.test(word)) tokens.push({ t: 'num', v: word.toUpperCase() === 'TRUE' ? 1 : 0 });
      else throw new Error('#NAME?');
      i = j;
      continue;
    }
    const two = input.slice(i, i + 2);
    if (['<=', '>=', '<>'].includes(two)) { tokens.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/^(),:=<>&%'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i++; continue; }
    throw new Error('#PARSE');
  }
  return tokens;
};

type Value = number | string | Value[];

const flatten = (values: Value[]): Array<number | string> => values.flatMap((value) => Array.isArray(value) ? flatten(value) : [value]);
const numbersOf = (values: Value[]) => flatten(values).filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));
const toNumber = (value: Value): number => {
  if (Array.isArray(value)) return toNumber(value[0] ?? 0);
  if (typeof value === 'number') return value;
  if (value === '') return 0;
  const n = Number(value);
  if (Number.isNaN(n)) throw new Error('#VALUE!');
  return n;
};
const toText = (value: Value): string => Array.isArray(value) ? toText(value[0] ?? '') : String(value);

export class FormulaEvaluator {
  private cache = new Map<string, CellValue>();
  private stack = new Set<string>();

  constructor(private getRaw: (row: number, col: number) => string) {}

  valueAt(row: number, col: number): CellValue {
    const key = `${row},${col}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    if (this.stack.has(key)) return '#CIRCULAR';
    const raw = this.getRaw(row, col);
    let result: CellValue;
    if (raw.startsWith('=')) {
      this.stack.add(key);
      try {
        result = this.evaluate(raw.slice(1));
      } catch (error) {
        result = error instanceof Error && error.message.startsWith('#') ? error.message : '#ERROR!';
      } finally {
        this.stack.delete(key);
      }
    } else if (raw.trim() !== '' && !Number.isNaN(Number(raw))) {
      result = Number(raw);
    } else {
      result = raw;
    }
    this.cache.set(key, result);
    return result;
  }

  private evaluate(expression: string): CellValue {
    const tokens = tokenize(expression);
    let pos = 0;
    const peek = () => tokens[pos];
    const eatOp = (op: string) => {
      const token = tokens[pos];
      if (token?.t === 'op' && token.v === op) { pos++; return true; }
      return false;
    };

    const rangeValues = (a: string, b: string): Value[] => {
      const start = parseRef(a);
      const end = parseRef(b);
      if (!start || !end) throw new Error('#REF!');
      const out: Value[] = [];
      for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
        for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) {
          const value = this.valueAt(r, c);
          if (typeof value === 'string' && value.startsWith('#')) throw new Error(value);
          if (value !== '') out.push(value);
        }
      }
      return out;
    };

    const callFunction = (name: string, args: Value[]): Value => {
      const nums = numbersOf(args);
      switch (name) {
        case 'SUM': return nums.reduce((a, b) => a + b, 0);
        case 'AVERAGE': case 'AVG': if (!nums.length) throw new Error('#DIV/0!'); return nums.reduce((a, b) => a + b, 0) / nums.length;
        case 'MIN': return nums.length ? Math.min(...nums) : 0;
        case 'MAX': return nums.length ? Math.max(...nums) : 0;
        case 'COUNT': return nums.length;
        case 'COUNTA': return flatten(args).filter((v) => v !== '').length;
        case 'ABS': return Math.abs(toNumber(args[0]));
        case 'ROUND': { const places = args[1] === undefined ? 0 : toNumber(args[1]); const f = 10 ** places; return Math.round(toNumber(args[0]) * f) / f; }
        case 'IF': return toNumber(args[0]) ? (args[1] ?? '') : (args[2] ?? '');
        case 'CONCAT': case 'CONCATENATE': return flatten(args).join('');
        case 'UPPER': return toText(args[0]).toUpperCase();
        case 'LOWER': return toText(args[0]).toLowerCase();
        case 'LEN': return toText(args[0]).length;
        case 'SQRT': { const v = toNumber(args[0]); if (v < 0) throw new Error('#NUM!'); return Math.sqrt(v); }
        case 'POWER': return toNumber(args[0]) ** toNumber(args[1]);
        case 'TODAY': return new Date().toISOString().slice(0, 10);
        default: throw new Error('#NAME?');
      }
    };

    const parseComparison = (): Value => {
      let left = parseConcat();
      for (;;) {
        const token = peek();
        if (token?.t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(token.v)) {
          pos++;
          const right = parseConcat();
          const l = typeof left === 'string' && Number.isNaN(Number(left)) ? left : toNumber(left);
          const r = typeof right === 'string' && Number.isNaN(Number(right)) ? right : toNumber(right);
          const op = token.v;
          left = Number(op === '=' ? l === r : op === '<>' ? l !== r : op === '<' ? l < r : op === '>' ? l > r : op === '<=' ? l <= r : l >= r);
        } else return left;
      }
    };
    const parseConcat = (): Value => {
      let left = parseAdditive();
      while (eatOp('&')) left = toText(left) + toText(parseAdditive());
      return left;
    };
    const parseAdditive = (): Value => {
      let left = parseTerm();
      for (;;) {
        if (eatOp('+')) left = toNumber(left) + toNumber(parseTerm());
        else if (eatOp('-')) left = toNumber(left) - toNumber(parseTerm());
        else return left;
      }
    };
    const parseTerm = (): Value => {
      let left = parsePower();
      for (;;) {
        if (eatOp('*')) left = toNumber(left) * toNumber(parsePower());
        else if (eatOp('/')) {
          const divisor = toNumber(parsePower());
          if (divisor === 0) throw new Error('#DIV/0!');
          left = toNumber(left) / divisor;
        } else return left;
      }
    };
    const parsePower = (): Value => {
      const base = parseUnary();
      if (eatOp('^')) return toNumber(base) ** toNumber(parsePower());
      return base;
    };
    const parseUnary = (): Value => {
      if (eatOp('-')) return -toNumber(parseUnary());
      if (eatOp('+')) return toNumber(parseUnary());
      return parsePostfix();
    };
    const parsePostfix = (): Value => {
      const value = parsePrimary();
      return eatOp('%') ? toNumber(value) / 100 : value;
    };
    const parsePrimary = (): Value => {
      const token = tokens[pos++];
      if (!token) throw new Error('#PARSE');
      if (token.t === 'num') return token.v;
      if (token.t === 'str') return token.v;
      if (token.t === 'ref') {
        if (eatOp(':')) {
          const end = tokens[pos++];
          if (end?.t !== 'ref') throw new Error('#REF!');
          return rangeValues(token.v, end.v);
        }
        const ref = parseRef(token.v);
        if (!ref) throw new Error('#REF!');
        const value = this.valueAt(ref.row, ref.col);
        if (typeof value === 'string' && value.startsWith('#')) throw new Error(value);
        return value;
      }
      if (token.t === 'id') {
        if (!eatOp('(')) throw new Error('#PARSE');
        const args: Value[] = [];
        if (!eatOp(')')) {
          do { args.push(parseComparison()); } while (eatOp(','));
          if (!eatOp(')')) throw new Error('#PARSE');
        }
        return callFunction(token.v, args);
      }
      if (token.t === 'op' && token.v === '(') {
        const value = parseComparison();
        if (!eatOp(')')) throw new Error('#PARSE');
        return value;
      }
      throw new Error('#PARSE');
    };

    const result = parseComparison();
    if (pos < tokens.length) throw new Error('#PARSE');
    const flat = Array.isArray(result) ? (result[0] ?? '') : result;
    return typeof flat === 'number' && !Number.isFinite(flat) ? '#NUM!' : flat as CellValue;
  }
}

export const toCsv = (rows: string[][]) => rows
  .map((row) => row.map((cell) => /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell).join(','))
  .join('\n');

export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
};
