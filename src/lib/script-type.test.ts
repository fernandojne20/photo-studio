import { describe, expect, it } from 'vitest';
import { isExecutableScriptType, scriptTypeString } from './script-type';

describe('scriptTypeString', () => {
  it('is text/javascript when type is absent', () => {
    expect(scriptTypeString({})).toBe('text/javascript');
  });

  it('is text/javascript when type is the empty string', () => {
    expect(scriptTypeString({ type: '' })).toBe('text/javascript');
  });

  it('lowercases and trims the type', () => {
    expect(scriptTypeString({ type: '  MODULE  ' })).toBe('module');
  });

  it('drops a parameter after ;', () => {
    expect(scriptTypeString({ type: 'text/javascript;charset=utf-8' })).toBe('text/javascript');
  });

  it('falls back to language only when type is entirely absent', () => {
    expect(scriptTypeString({ language: 'JavaScript' })).toBe('text/javascript');
  });

  it('ignores language once type is present, even empty', () => {
    expect(scriptTypeString({ type: '', language: 'nonsense' })).toBe('text/javascript');
  });
});

describe('isExecutableScriptType', () => {
  it('accepts a classic script with no type', () => {
    expect(isExecutableScriptType({})).toBe(true);
  });

  it('accepts every standard JavaScript MIME type', () => {
    expect(isExecutableScriptType({ type: 'application/javascript' })).toBe(true);
    expect(isExecutableScriptType({ type: 'text/javascript1.1' })).toBe(true);
  });

  it('accepts a module script', () => {
    expect(isExecutableScriptType({ type: 'module' })).toBe(true);
  });

  it('rejects importmap and speculationrules: data blocks, not fetched or run', () => {
    expect(isExecutableScriptType({ type: 'importmap' })).toBe(false);
    expect(isExecutableScriptType({ type: 'speculationrules' })).toBe(false);
  });

  it('rejects an unrelated data block', () => {
    expect(isExecutableScriptType({ type: 'application/ld+json' })).toBe(false);
  });
});
