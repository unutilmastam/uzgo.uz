import { describe, expect, it } from 'vitest';
import { listingSearch, parseListingParams } from './listing-params';

describe('parseListingParams', () => {
  it('keeps valid params and drops invalid ones', () => {
    expect(
      parseListingParams({
        q: ' choynak ',
        attr: ['color:black', 'bad attr', 'memory:128gb'],
        sort: 'price_asc',
        page: '2',
        minPrice: '1000',
        maxPrice: 'abc',
        category: '../x',
      }),
    ).toEqual({
      q: 'choynak',
      attr: ['color:black', 'memory:128gb'],
      sort: 'price_asc',
      page: '2',
      minPrice: '1000',
    });
    expect(parseListingParams({ sort: 'evil', page: '0' })).toEqual({});
  });
});

describe('listingSearch', () => {
  it('serialises and overrides', () => {
    expect(listingSearch({ q: 'a b', attr: ['color:red'], page: '3' }, { page: undefined })).toBe(
      '?q=a+b&attr=color%3Ared',
    );
    expect(listingSearch({})).toBe('');
  });
});
