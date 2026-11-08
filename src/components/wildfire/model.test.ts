import { describe, expect, it } from 'vitest';
import { parseCoordinates } from './model';
describe('site coordinates', () => {
  it('accepts negative longitude beyond 90 degrees without treating it as latitude', () => {
    expect(parseCoordinates('37.7749, -122.4194')).toEqual({ lat: 37.7749, lng: -122.4194 });
    expect(parseCoordinates('(0, 0)')).toEqual({ lat: 0, lng: 0 });
    expect(parseCoordinates('-90 180')).toEqual({ lat: -90, lng: 180 });
  });
  it('rejects swapped or out-of-range coordinates with a specific explanation', () => {
    expect(() => parseCoordinates('-122, 37')).toThrow('Latitude (the first number)');
    expect(() => parseCoordinates('37, -181')).toThrow('Longitude (the second number)');
    for (const value of ['', '37', 'abc, 12', '37, Infinity', '1,2,3']) expect(() => parseCoordinates(value)).toThrow();
  });
});
