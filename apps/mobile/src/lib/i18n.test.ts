import { describe, expect, it } from 'vitest';
import { localeFromDevice, messageKeys, translate } from './i18n';

describe('mobile i18n', () => {
  it('has the same keys in Uzbek and Russian', () => {
    expect(messageKeys('ru')).toEqual(messageKeys('uz'));
  });

  it('has no empty texts', () => {
    for (const locale of ['uz', 'ru'] as const) {
      for (const key of messageKeys(locale)) {
        expect(translate(locale, key).trim(), `${locale}.${key}`).not.toBe('');
      }
    }
  });

  it('fills placeholders and picks plural forms', () => {
    expect(translate('uz', 'orderNumber', { number: 'UZ-1' })).toBe('Buyurtma UZ-1');
    expect(translate('ru', 'itemCount', { count: 1 })).toBe('1 товар');
    expect(translate('ru', 'itemCount', { count: 3 })).toBe('3 товара');
    expect(translate('ru', 'itemCount', { count: 11 })).toBe('11 товаров');
    expect(translate('uz', 'itemCount', { count: 5 })).toBe('5 ta mahsulot');
    expect(translate('uz', 'no.such.key')).toBe('no.such.key');
  });

  it('follows the phone language', () => {
    expect(localeFromDevice('ru')).toBe('ru');
    expect(localeFromDevice('uz')).toBe('uz');
    expect(localeFromDevice('en')).toBe('uz');
    expect(localeFromDevice(null)).toBe('uz');
  });
});
