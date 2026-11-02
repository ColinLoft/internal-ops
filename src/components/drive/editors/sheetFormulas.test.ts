import { describe, expect, it } from 'vitest';
import { columnName, FormulaEvaluator, parseCsv, parseRef, toCsv } from './sheetFormulas';

const sheet = (grid: string[][]) => new FormulaEvaluator((r, c) => grid[r]?.[c] ?? '');

describe('sheet formulas', () => {
  it('names columns and parses refs', () => {
    expect(columnName(0)).toBe('A');
    expect(columnName(26)).toBe('AA');
    expect(parseRef('B3')).toEqual({ row: 2, col: 1 });
  });

  it('evaluates arithmetic and functions over ranges', () => {
    const e = sheet([['1', '2', '=SUM(A1:B1)'], ['4', '5', '=AVERAGE(A2:B2)'], ['=A1+A2*2', '=IF(A1<A2,"lt","ge")', '=ROUND(10/3,2)']]);
    expect(e.valueAt(0, 2)).toBe(3);
    expect(e.valueAt(1, 2)).toBe(4.5);
    expect(e.valueAt(2, 0)).toBe(9);
    expect(e.valueAt(2, 1)).toBe('lt');
    expect(e.valueAt(2, 2)).toBe(3.33);
  });

  it('reports errors', () => {
    const e = sheet([['=1/0', '=A2', '=A1+1'], ['=B1', '=FOO(1)', '=(1+']]);
    expect(e.valueAt(0, 0)).toBe('#DIV/0!');
    expect(e.valueAt(0, 1)).toBe('#CIRCULAR');
    expect(e.valueAt(0, 2)).toBe('#DIV/0!');
    expect(e.valueAt(1, 1)).toBe('#NAME?');
    expect(e.valueAt(1, 2)).toBe('#PARSE');
  });

  it('round-trips CSV', () => {
    const rows = [['a', 'b,c'], ['"q"', 'line\nbreak']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
