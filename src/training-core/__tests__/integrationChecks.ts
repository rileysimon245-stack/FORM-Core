import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import React from 'react';
import {
  resetMigrationSessionFlagForTests,
  safeSetItem,
  CORRUPTED_RAW_PREFIX,
  PENDING_ROLLBACK_KEY,
  ROLLBACK_SNAPSHOT_KEY,
  ROLLBACK_SNAPSHOT_STAGING_KEY,
} from '../../services/migrations';
import { StorageService } from '../../services/storage';
import type { TestCaseResult } from './suite';

async function getReactDomHelpers() {
  const [{ createRoot }, { flushSync }] = await Promise.all([
    import('react-dom/client'),
    import('react-dom'),
  ]);
  return { createRoot, flushSync };
}

function collectNonTestSourceFiles(dir: string, acc: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'tests') continue;
      collectNonTestSourceFiles(full, acc);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

type TokenKind =
  | 'Identifier'
  | 'Keyword'
  | 'StringLiteral'
  | 'NumberLiteral'
  | 'Punctuator';

interface ScannedToken {
  kind: TokenKind;
  value: string;
  line: number;
}

const REGEX_PRECEDING_KEYWORDS = new Set([
  'return',
  'throw',
  'case',
  'delete',
  'void',
  'typeof',
  'yield',
  'await',
  'instanceof',
  'in',
  'of',
  'new',
  'else',
  'do',
]);

const REGEX_PRECEDING_PUNCT = new Set([
  '(',
  '[',
  '{',
  ',',
  ';',
  ':',
  '?',
  '!',
  '~',
  '=',
  '===',
  '!==',
  '==',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  '+',
  '-',
  '*',
  '/',
  '%',
  '**',
  '&&',
  '||',
  '??',
  '&',
  '|',
  '^',
  '=>',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '??=',
  '&&=',
  '||=',
  '...',
]);

const JSX_PRECEDING_KEYWORDS = new Set([
  'return',
  'throw',
  'case',
  'yield',
  'await',
  'else',
  'do',
]);

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

function readEscapeChar(code: string, i: number): { ch: string; nextIdx: number } {
  if (i >= code.length) return { ch: '', nextIdx: i };
  const esc = code[i];
  if (esc === '\r' && code[i + 1] === '\n') return { ch: '', nextIdx: i + 2 };
  if (esc === '\n' || esc === '\r') return { ch: '', nextIdx: i + 1 };
  if (esc === 'n') return { ch: '\n', nextIdx: i + 1 };
  if (esc === 'r') return { ch: '\r', nextIdx: i + 1 };
  if (esc === 't') return { ch: '\t', nextIdx: i + 1 };
  if (esc === 'b') return { ch: '\b', nextIdx: i + 1 };
  if (esc === 'f') return { ch: '\f', nextIdx: i + 1 };
  if (esc === 'v') return { ch: '\v', nextIdx: i + 1 };
  if (esc === 'x' && /^[0-9a-fA-F]{2}/.test(code.slice(i + 1, i + 3))) {
    return {
      ch: String.fromCharCode(parseInt(code.slice(i + 1, i + 3), 16)),
      nextIdx: i + 3,
    };
  }
  if (esc === 'u') {
    if (code[i + 1] === '{') {
      const end = code.indexOf('}', i + 2);
      if (end !== -1) {
        const hex = code.slice(i + 2, end);
        if (/^[0-9a-fA-F]+$/.test(hex)) {
          return { ch: String.fromCodePoint(parseInt(hex, 16)), nextIdx: end + 1 };
        }
      }
    } else if (/^[0-9a-fA-F]{4}/.test(code.slice(i + 1, i + 5))) {
      return {
        ch: String.fromCharCode(parseInt(code.slice(i + 1, i + 5), 16)),
        nextIdx: i + 5,
      };
    }
  }
  return { ch: esc, nextIdx: i + 1 };
}

function canStartRegex(prev: ScannedToken | null): boolean {
  if (!prev) return true;
  if (prev.kind === 'Keyword') return REGEX_PRECEDING_KEYWORDS.has(prev.value);
  if (prev.kind === 'Punctuator') return REGEX_PRECEDING_PUNCT.has(prev.value);
  return false;
}

function canStartJsx(prev: ScannedToken | null): boolean {
  if (!prev) return true;
  if (prev.kind === 'Keyword') return JSX_PRECEDING_KEYWORDS.has(prev.value);
  if (prev.kind === 'Punctuator') {
    return (
      prev.value === '(' ||
      prev.value === '[' ||
      prev.value === '{' ||
      prev.value === ',' ||
      prev.value === ';' ||
      prev.value === ':' ||
      prev.value === '?' ||
      prev.value === '=>' ||
      prev.value === '&&' ||
      prev.value === '||' ||
      prev.value === '??' ||
      prev.value === '='
    );
  }
  return false;
}

const JS_KEYWORDS = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'await',
  'of',
]);

type ModeFrame =
  | { kind: 'ts_brace' }
  | { kind: 'template_expr' }
  | { kind: 'jsx_expr'; tagStack: string[] }
  | { kind: 'jsx_children'; tagStack: string[] };

function tokenizeTypeScriptOrTsx(code: string, isTsx: boolean): ScannedToken[] {
  const tokens: ScannedToken[] = [];
  const stack: ModeFrame[] = [];
  let line = 1;
  let i = 0;

  const lastToken = (): ScannedToken | null =>
    tokens.length > 0 ? tokens[tokens.length - 1] : null;

  const currentTop = (): ModeFrame | undefined =>
    stack.length > 0 ? stack[stack.length - 1] : undefined;

  const looksLikeJsxStartAt = (pos: number): boolean => {
    if (!isTsx || code[pos] !== '<') return false;
    if (code[pos + 1] === '>') return true; // JSX fragment <>
    if (!isIdentStart(code[pos + 1] || '')) return false;
    // Skip TS generic arrow syntax `<T,>(...)` or `<T extends ...>`
    let j = pos + 1;
    while (j < code.length && (isIdentPart(code[j]) || code[j] === '.')) j++;
    while (j < code.length && /\s/.test(code[j])) j++;
    if (code[j] === ',') return false;
    if (code.startsWith('extends', j) && !isIdentPart(code[j + 7] || '')) return false;
    return true;
  };

  const scanTemplateLiteral = (isContinuation: boolean) => {
    let val = '';
    if (!isContinuation) {
      i += 1; // skip opening `
    }
    let hasInterpolation = false;
    while (i < code.length) {
      const ch = code[i];
      if (ch === '`') {
        i += 1;
        if (!hasInterpolation && !isContinuation) {
          tokens.push({ kind: 'StringLiteral', value: val, line });
        }
        return;
      }
      if (ch === '$' && code[i + 1] === '{') {
        hasInterpolation = true;
        i += 2;
        tokens.push({ kind: 'Punctuator', value: '${', line });
        stack.push({ kind: 'template_expr' });
        return;
      }
      if (ch === '\\') {
        const startLine = line;
        if (code[i + 1] === '\r' && code[i + 2] === '\n') line += 1;
        else if (code[i + 1] === '\n') line += 1;
        const { ch: escCh, nextIdx } = readEscapeChar(code, i + 1);
        val += escCh;
        i = nextIdx;
        void startLine;
        continue;
      }
      if (ch === '\n') line += 1;
      val += ch;
      i += 1;
    }
  };

  const scanJsxOpenOrCloseTag = (tagStack: string[]) => {
    const tagLine = line;
    i += 1; // skip '<'
    if (code[i] === '/') {
      // Closing tag </Tag> or </>
      i += 1;
      while (i < code.length && /\s/.test(code[i])) {
        if (code[i] === '\n') line += 1;
        i += 1;
      }
      while (i < code.length && (isIdentPart(code[i]) || code[i] === '.')) i += 1;
      while (i < code.length && code[i] !== '>') {
        if (code[i] === '\n') line += 1;
        i += 1;
      }
      if (code[i] === '>') i += 1;
      tagStack.pop();
      if (tagStack.length === 0) {
        // Finished JSX root element; pop jsx_children if on top
        if (currentTop()?.kind === 'jsx_children') {
          stack.pop();
        }
      }
      tokens.push({ kind: 'Punctuator', value: ')', line: tagLine });
      return;
    }

    // Fragment <>
    if (code[i] === '>') {
      i += 1;
      tagStack.push('');
      if (currentTop()?.kind !== 'jsx_children') {
        stack.push({ kind: 'jsx_children', tagStack });
      }
      tokens.push({ kind: 'Punctuator', value: '(', line: tagLine });
      return;
    }

    // Opening tag <TagName ...>
    let tagName = '';
    while (i < code.length && (isIdentPart(code[i]) || code[i] === '.')) {
      tagName += code[i];
      i += 1;
    }

    // Scan attributes until `>` or `/>`
    while (i < code.length) {
      const ch = code[i];
      if (ch === '\n') {
        line += 1;
        i += 1;
        continue;
      }
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }
      if (ch === '/' && code[i + 1] === '>') {
        i += 2;
        if (tagStack.length === 0) {
          tokens.push({ kind: 'Punctuator', value: ')', line: tagLine });
        }
        return;
      }
      if (ch === '>') {
        i += 1;
        tagStack.push(tagName);
        if (currentTop()?.kind !== 'jsx_children') {
          stack.push({ kind: 'jsx_children', tagStack });
        }
        tokens.push({ kind: 'Punctuator', value: '(', line: tagLine });
        return;
      }
      if (ch === '{') {
        i += 1;
        tokens.push({ kind: 'Punctuator', value: '{', line });
        stack.push({ kind: 'jsx_expr', tagStack });
        return;
      }
      if (ch === '"' || ch === "'") {
        const quote = ch;
        i += 1;
        while (i < code.length && code[i] !== quote) {
          if (code[i] === '\n') line += 1;
          if (code[i] === '\\') i += 2;
          else i += 1;
        }
        if (code[i] === quote) i += 1;
        continue;
      }
      if (isIdentStart(ch)) {
        while (i < code.length && (isIdentPart(code[i]) || code[i] === '-')) i += 1;
        continue;
      }
      i += 1;
    }
  };

  while (i < code.length) {
    const top = currentTop();
    if (top?.kind === 'jsx_children') {
      const ch = code[i];
      if (ch === '<') {
        scanJsxOpenOrCloseTag(top.tagStack);
        continue;
      }
      if (ch === '{') {
        i += 1;
        tokens.push({ kind: 'Punctuator', value: '{', line });
        stack.push({ kind: 'jsx_expr', tagStack: top.tagStack });
        continue;
      }
      if (ch === '\n') line += 1;
      i += 1;
      continue;
    }

    const ch = code[i];
    if (ch === '\n') {
      line += 1;
      i += 1;
      continue;
    }
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    // Comments
    if (ch === '/' && code[i + 1] === '/') {
      i += 2;
      while (i < code.length && code[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && code[i + 1] === '*') {
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] === '\n') line += 1;
        i += 1;
      }
      i += 2;
      continue;
    }

    // Strings
    if (ch === "'" || ch === '"') {
      const quote = ch;
      const startLine = line;
      let val = '';
      i += 1;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') {
          if (code[i + 1] === '\n') line += 1;
          else if (code[i + 1] === '\r' && code[i + 2] === '\n') line += 1;
          const { ch: escCh, nextIdx } = readEscapeChar(code, i + 1);
          val += escCh;
          i = nextIdx;
          continue;
        }
        if (code[i] === '\n') {
          line += 1;
          break;
        }
        val += code[i];
        i += 1;
      }
      if (code[i] === quote) i += 1;
      tokens.push({ kind: 'StringLiteral', value: val, line: startLine });
      continue;
    }

    // Template literal
    if (ch === '`') {
      scanTemplateLiteral(false);
      continue;
    }

    // Regex literal
    if (ch === '/' && canStartRegex(lastToken())) {
      const startLine = line;
      i += 1;
      let inClass = false;
      while (i < code.length) {
        const rc = code[i];
        if (rc === '\\') {
          i += 2;
          continue;
        }
        if (rc === '[') {
          inClass = true;
          i += 1;
          continue;
        }
        if (rc === ']' && inClass) {
          inClass = false;
          i += 1;
          continue;
        }
        if (rc === '/' && !inClass) {
          i += 1;
          break;
        }
        if (rc === '\n') break;
        i += 1;
      }
      while (i < code.length && /[a-zA-Z]/.test(code[i])) i += 1;
      tokens.push({ kind: 'StringLiteral', value: '/regex/', line: startLine });
      continue;
    }

    // JSX opening tag
    if (ch === '<' && canStartJsx(lastToken()) && looksLikeJsxStartAt(i)) {
      scanJsxOpenOrCloseTag([]);
      continue;
    }

    // Number literal
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(code[i + 1] || ''))) {
      const start = i;
      while (i < code.length && /[0-9a-fA-FxXbBoOn_.]/.test(code[i])) i += 1;
      tokens.push({ kind: 'NumberLiteral', value: code.slice(start, i), line });
      continue;
    }

    // Identifier / Keyword
    if (isIdentStart(ch)) {
      const start = i;
      while (i < code.length && isIdentPart(code[i])) i += 1;
      const word = code.slice(start, i);
      tokens.push({
        kind: JS_KEYWORDS.has(word) ? 'Keyword' : 'Identifier',
        value: word,
        line,
      });
      continue;
    }

    // Braces handling for template_expr / jsx_expr / ts_brace
    if (ch === '{') {
      tokens.push({ kind: 'Punctuator', value: '{', line });
      stack.push({ kind: 'ts_brace' });
      i += 1;
      continue;
    }

    if (ch === '}') {
      const popped = stack.pop();
      tokens.push({ kind: 'Punctuator', value: '}', line });
      i += 1;
      if (popped?.kind === 'template_expr') {
        scanTemplateLiteral(true);
      } else if (popped?.kind === 'jsx_expr') {
        // Resumed inside JSX attribute list or JSX children; if we were in attributes (next isn't children), continue attribute scan until `>` or `/>`
        if (currentTop()?.kind !== 'jsx_children') {
          // Inside attributes of an opening tag: finish attributes of that opening tag
          const tagStack: string[] = [];
          while (i < code.length) {
            const ac = code[i];
            if (ac === '\n') {
              line += 1;
              i += 1;
              continue;
            }
            if (/\s/.test(ac)) {
              i += 1;
              continue;
            }
            if (ac === '/' && code[i + 1] === '>') {
              i += 2;
              break;
            }
            if (ac === '>') {
              i += 1;
              tagStack.push('tag');
              stack.push({ kind: 'jsx_children', tagStack });
              break;
            }
            if (ac === '{') {
              i += 1;
              tokens.push({ kind: 'Punctuator', value: '{', line });
              stack.push({ kind: 'jsx_expr', tagStack });
              break;
            }
            if (ac === '"' || ac === "'") {
              const q = ac;
              i += 1;
              while (i < code.length && code[i] !== q) {
                if (code[i] === '\n') line += 1;
                if (code[i] === '\\') i += 2;
                else i += 1;
              }
              if (code[i] === q) i += 1;
              continue;
            }
            i += 1;
          }
        }
      }
      continue;
    }

    // Multi-char punctuators
    const three = code.slice(i, i + 3);
    if (three === '===' || three === '!==' || three === '...' || three === '??=' || three === '&&=' || three === '||=') {
      tokens.push({ kind: 'Punctuator', value: three, line });
      i += 3;
      continue;
    }
    const two = code.slice(i, i + 2);
    if (
      two === '=>' ||
      two === '==' ||
      two === '!=' ||
      two === '<=' ||
      two === '>=' ||
      two === '&&' ||
      two === '||' ||
      two === '??' ||
      two === '?.' ||
      two === '++' ||
      two === '--' ||
      two === '+=' ||
      two === '-=' ||
      two === '*=' ||
      two === '/=' ||
      two === '%=' ||
      two === '**'
    ) {
      tokens.push({ kind: 'Punctuator', value: two, line });
      i += 2;
      continue;
    }

    tokens.push({ kind: 'Punctuator', value: ch, line });
    i += 1;
  }

  return tokens;
}

function tryEvalBracketStaticStrings(tokens: ScannedToken[], openBracketIdx: number): {
  closeIdx: number;
  evaluated: string | null;
  containedStringValues: string[];
} {
  let depth = 0;
  let i = openBracketIdx;
  const inner: ScannedToken[] = [];
  for (; i < tokens.length; i++) {
    if (tokens[i].kind === 'Punctuator' && tokens[i].value === '[') {
      depth += 1;
      if (depth === 1) continue;
    } else if (tokens[i].kind === 'Punctuator' && tokens[i].value === ']') {
      depth -= 1;
      if (depth === 0) break;
    }
    inner.push(tokens[i]);
  }

  const containedStringValues = inner
    .filter((t) => t.kind === 'StringLiteral')
    .map((t) => t.value);

  // Фильтруем скобки группировки, чтобы поймать ('local' + 'Storage')
  const unwrapped = inner.filter(
    (t) => !(t.kind === 'Punctuator' && (t.value === '(' || t.value === ')'))
  );

  let evaluated: string | null = null;
  if (unwrapped.length === 1 && unwrapped[0].kind === 'StringLiteral') {
    evaluated = unwrapped[0].value;
  } else if (unwrapped.length >= 3 && unwrapped.length % 2 === 1) {
    let ok = true;
    let acc = '';
    for (let k = 0; k < unwrapped.length; k++) {
      if (k % 2 === 0) {
        if (unwrapped[k].kind === 'StringLiteral') {
          acc += unwrapped[k].value;
        } else {
          ok = false;
          break;
        }
      } else if (!(unwrapped[k].kind === 'Punctuator' && unwrapped[k].value === '+')) {
        ok = false;
        break;
      }
    }
    if (ok) evaluated = acc;
  }

  return { closeIdx: i, evaluated, containedStringValues };
}

export interface GatewayScanResult {
  violations: string[];
  allowedGatewayLocations: string[];
}

export function findGatewayViolationsInSource(
  relPath: string,
  sourceText: string,
  isMigrationsFile: boolean
): GatewayScanResult {
  const isTsx = relPath.endsWith('.tsx');
  const tokens = tokenizeTypeScriptOrTsx(sourceText, isTsx);
  const violations: string[] = [];
  const allowedGatewayLocations = new Set<string>();
  const STORAGE_MUTATION_METHODS = new Set(['setItem', 'removeItem', 'clear']);

  let braceDepth = 0;
  let pendingTopFnName: string | null = null;
  let pendingFnParenDepth = 0;
  let pendingFnSawParens = false;
  let activeTopFnName: string | null = null;
  let activeTopFnDepth = -1;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = i > 0 ? tokens[i - 1] : null;
    const next = i + 1 < tokens.length ? tokens[i + 1] : null;
    const next2 = i + 2 < tokens.length ? tokens[i + 2] : null;

    if (
      t.kind === 'Keyword' &&
      t.value === 'function' &&
      next?.kind === 'Identifier' &&
      braceDepth === 0
    ) {
      pendingTopFnName = next.value;
      pendingFnParenDepth = 0;
      pendingFnSawParens = false;
    }

    if (pendingTopFnName && braceDepth === 0) {
      if (t.kind === 'Punctuator' && t.value === '(') {
        pendingFnParenDepth += 1;
        pendingFnSawParens = true;
      } else if (t.kind === 'Punctuator' && t.value === ')') {
        pendingFnParenDepth = Math.max(0, pendingFnParenDepth - 1);
      } else if (t.kind === 'Punctuator' && t.value === ';' && pendingFnParenDepth === 0) {
        pendingTopFnName = null;
        pendingFnSawParens = false;
      }
    }

    if (t.kind === 'Punctuator' && t.value === '{') {
      if (
        braceDepth === 0 &&
        pendingTopFnName &&
        pendingFnSawParens &&
        pendingFnParenDepth === 0 &&
        !(
          prev?.kind === 'Punctuator' &&
          (prev.value === ':' ||
            prev.value === '|' ||
            prev.value === '&' ||
            prev.value === '=>' ||
            prev.value === '<' ||
            prev.value === ',' ||
            prev.value === '(' ||
            prev.value === '[')
        )
      ) {
        activeTopFnName = pendingTopFnName;
        activeTopFnDepth = 1;
        pendingTopFnName = null;
        pendingFnSawParens = false;
      }
      braceDepth += 1;
    } else if (t.kind === 'Punctuator' && t.value === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      if (braceDepth < activeTopFnDepth) {
        activeTopFnName = null;
        activeTopFnDepth = -1;
      }
    }

    // 1. Запрет любых идентификаторов localStorage / sessionStorage / getStorage
    if (t.kind === 'Identifier') {
      if (t.value === 'localStorage') {
        if (!(isMigrationsFile && activeTopFnName === 'getStorage')) {
          violations.push(`${relPath}:${t.line} — идентификатор localStorage запрещён вне getStorage()`);
        }
      } else if (t.value === 'sessionStorage') {
        violations.push(`${relPath}:${t.line} — идентификатор sessionStorage запрещён`);
      } else if (t.value === 'getStorage' && !isMigrationsFile) {
        violations.push(`${relPath}:${t.line} — импорт/вызов getStorage() запрещён вне migrations.ts`);
      }

      // Storage.prototype (точка)
      if (
        t.value === 'Storage' &&
        next?.kind === 'Punctuator' &&
        next.value === '.' &&
        next2?.kind === 'Identifier' &&
        next2.value === 'prototype'
      ) {
        violations.push(`${relPath}:${t.line} — обращение к Storage.prototype запрещено`);
      }

      // storage.setItem / storage.removeItem / storage.clear (точка)
      if (
        t.value === 'storage' &&
        !(prev?.kind === 'Punctuator' && prev.value === '.') &&
        next?.kind === 'Punctuator' &&
        next.value === '.' &&
        next2?.kind === 'Identifier' &&
        STORAGE_MUTATION_METHODS.has(next2.value)
      ) {
        if (isMigrationsFile) {
          if (
            (activeTopFnName === 'gatewayRawSet' && next2.value === 'setItem') ||
            (activeTopFnName === 'gatewayRawRemove' && next2.value === 'removeItem')
          ) {
            allowedGatewayLocations.add(`${relPath}:fn=${activeTopFnName}:${next2.value}`);
          } else {
            violations.push(
              `${relPath}:${t.line} — storage.${next2.value} разрешён только в gatewayRawSet/gatewayRawRemove`
            );
          }
        } else {
          violations.push(`${relPath}:${t.line} — обращение к storage.${next2.value} вне шлюза`);
        }
      }
    }

    // 2. Любой индексный/вычисляемый доступ вида [...['localStorage']], window['local' + 'Storage'], Storage['prototype'], storage['setItem']
    if (t.kind === 'Punctuator' && t.value === '[') {
      const bracketInfo = tryEvalBracketStaticStrings(tokens, i);
      const val = bracketInfo.evaluated;
      if (
        val === 'localStorage' ||
        val === 'sessionStorage' ||
        bracketInfo.containedStringValues.includes('localStorage') ||
        bracketInfo.containedStringValues.includes('sessionStorage')
      ) {
        violations.push(
          `${relPath}:${t.line} — индексный доступ к '${val || 'localStorage/sessionStorage'}' запрещён`
        );
      }
      if (
        (val === 'prototype' || bracketInfo.containedStringValues.includes('prototype')) &&
        prev?.kind === 'Identifier' &&
        prev.value === 'Storage'
      ) {
        violations.push(`${relPath}:${t.line} — обращение к Storage['prototype'] запрещено`);
      }
      if (
        val &&
        STORAGE_MUTATION_METHODS.has(val) &&
        prev?.kind === 'Identifier' &&
        (prev.value === 'storage' || prev.value === 'localStorage' || prev.value === 'sessionStorage')
      ) {
        violations.push(
          `${relPath}:${t.line} — индексный мутирующий доступ ${prev.value}['${val}'] запрещён`
        );
      }
    }
  }

  return {
    violations,
    allowedGatewayLocations: Array.from(allowedGatewayLocations),
  };
}

export function runGatewayRegressionCheck(projectRoot = process.cwd()): TestCaseResult {
  const name =
    'Регрессионная проверка AST: запрет localStorage/sessionStorage, Storage.prototype и алиасов вне migrations.ts';
  const group = 'Защита шлюза (Этап 3)';
  try {
    const srcDir = path.join(projectRoot, 'src');
    const files = collectNonTestSourceFiles(srcDir);
    const violations: string[] = [];
    const allowedGatewayLocations = new Set<string>();
    const migrationsPath = path.resolve(srcDir, 'services/migrations.ts');

    for (const file of files) {
      const resolved = path.resolve(file);
      const rel = path.relative(projectRoot, resolved).replace(/\\/g, '/');
      const raw = fs.readFileSync(resolved, 'utf8');
      const scan = findGatewayViolationsInSource(rel, raw, resolved === migrationsPath);
      violations.push(...scan.violations);
      for (const loc of scan.allowedGatewayLocations) {
        allowedGatewayLocations.add(loc);
      }
    }

    if (violations.length > 0) {
      throw new Error(`Нарушен единый шлюз записи:\n${violations.join('\n')}`);
    }
    if (allowedGatewayLocations.size !== 2) {
      throw new Error(
        `Ожидались ровно 2 точки низкоуровневого шлюза (gatewayRawSet + gatewayRawRemove), найдено: ${allowedGatewayLocations.size}`
      );
    }

    return {
      group,
      name,
      passed: true,
      details: `Проверено ${files.length} файлов по AST; разрешены только ${Array.from(allowedGatewayLocations).join(', ')}`,
    };
  } catch (err: any) {
    return {
      group,
      name,
      passed: false,
      details: err?.message || String(err),
    };
  }
}

export function runGatewayBypassDetectionTest(): TestCaseResult {
  const name = 'Защита шлюза: AST-проверка отлавливает алиасы, деструктуризацию, индексный доступ и Storage.prototype';
  const group = 'Защита шлюза (Этап 3)';
  try {
    const mustCatch: Array<{ label: string; code: string }> = [
      { label: 'алиас window.localStorage', code: `const s = window.localStorage; s.setItem('a', 'b');` },
      { label: 'деструктуризация из localStorage', code: `const { setItem } = localStorage; setItem('a', 'b');` },
      { label: 'деструктуризация localStorage из window', code: `const { localStorage: ls } = window; ls.setItem('a', 'b');` },
      { label: 'индексный вызов метода localStorage["setItem"]', code: `localStorage['setItem']('a', 'b');` },
      { label: 'Storage.prototype.setItem', code: `Storage.prototype.setItem.call({}, 'a', 'b');` },
      { label: "Storage['prototype'].removeItem", code: `Storage['prototype']['removeItem'].call({}, 'a');` },
      { label: "window['any']['localStorage']", code: `window['any']['localStorage'].setItem('a', 'b');` },
      { label: "globalThis[k]['localStorage']", code: `globalThis[k]['localStorage'].setItem('a', 'b');` },
      { label: "(globalThis as any)['local' + 'Storage']", code: `(globalThis as any)['local' + 'Storage'].clear();` },
      { label: 'sessionStorage через вычисляемую деструктуризацию', code: `const { ['sessionStorage']: ss } = globalThis; ss.setItem('a', 'b');` },
    ];

    for (const sample of mustCatch) {
      const res = findGatewayViolationsInSource('src/testSample.ts', sample.code, false);
      if (res.violations.length === 0) {
        throw new Error(`Обход шлюза "${sample.label}" не обнаружен проверкой!`);
      }
    }

    // Проверяем, что UI-текст и комментарии не дают ложных срабатываний
    const safeUiCode = `
      // В комментарии упоминается localStorage и sessionStorage
      export function Banner() {
        const hint = 'Данные сохранены в localStorage через StorageService';
        return <span>0. Сырой JSON в localStorage ({hint})</span>;
      }
    `;
    const safeRes = findGatewayViolationsInSource('src/SafeBanner.tsx', safeUiCode, false);
    if (safeRes.violations.length > 0) {
      throw new Error(`Ложное срабатывание на UI-строку/комментарий: ${safeRes.violations.join('; ')}`);
    }

    return {
      group,
      name,
      passed: true,
      details: `Все ${mustCatch.length} вариантов обхода шлюза пойманы; 0 ложных срабатываний на UI-строки`,
    };
  } catch (err: any) {
    return {
      group,
      name,
      passed: false,
      details: err?.message || String(err),
    };
  }
}

interface DomTestContext {
  dom: JSDOM;
  store: Map<string, string>;
  setRemoveErrorForKey: (key: string | null) => void;
  setSetErrorForKey: (key: string | null) => void;
  clipboardWrites: string[];
  cleanup: () => void;
}

const sharedPendingRafTimers = new Set<ReturnType<typeof setTimeout>>();

function clearSharedPendingRafTimers() {
  for (const id of sharedPendingRafTimers) {
    clearTimeout(id);
  }
  sharedPendingRafTimers.clear();
}

function setupReactDomTestEnv(): DomTestContext {
  const savedProps = new Map<string, PropertyDescriptor | undefined>();
  const setGlobalProp = (key: string, value: any) => {
    if (!savedProps.has(key)) {
      savedProps.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    }
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  };

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost:3000/',
  });

  const store = new Map<string, string>();
  let failRemoveKey: string | null = null;
  let failSetKey: string | null = null;
  const clipboardWrites: string[] = [];

  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(k: string) {
      return store.has(k) ? store.get(k)! : null;
    },
    key(i: number) {
      return Array.from(store.keys())[i] ?? null;
    },
    removeItem(k: string) {
      if (failRemoveKey === k) {
        const err: any = new Error(`Simulated removeItem failure on ${k}`);
        err.name = 'QuotaExceededError';
        err.code = 22;
        throw err;
      }
      store.delete(k);
    },
    setItem(k: string, v: string) {
      if (failSetKey === k) {
        const err: any = new Error(`Simulated setItem failure on ${k}`);
        err.name = 'QuotaExceededError';
        err.code = 22;
        throw err;
      }
      store.set(k, String(v));
    },
  };

  if (!dom.window.HTMLElement.prototype.scrollTo) {
    dom.window.HTMLElement.prototype.scrollTo = () => {};
  }
  if (!dom.window.Element.prototype.scrollIntoView) {
    dom.window.Element.prototype.scrollIntoView = () => {};
  }

  const MockMatchMedia = () => ({
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });

  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  class MockImage {
    crossOrigin = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private _src = '';
    get src() {
      return this._src;
    }
    set src(val: string) {
      this._src = val;
    }
  }

  Object.defineProperty(dom.window.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        clipboardWrites.push(text);
      },
    },
  });

  setGlobalProp('window', dom.window);
  setGlobalProp('document', dom.window.document);
  setGlobalProp('HTMLElement', dom.window.HTMLElement);
  setGlobalProp('Element', dom.window.Element);
  setGlobalProp('Node', dom.window.Node);
  setGlobalProp('Event', dom.window.Event);
  setGlobalProp('PopStateEvent', dom.window.PopStateEvent);
  setGlobalProp('HashChangeEvent', dom.window.HashChangeEvent);
  setGlobalProp('localStorage', memoryStorage);
  setGlobalProp('matchMedia', MockMatchMedia);
  setGlobalProp('ResizeObserver', MockResizeObserver);
  setGlobalProp('IntersectionObserver', MockIntersectionObserver);
  setGlobalProp('Image', MockImage);
  setGlobalProp('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = setTimeout(() => {
      sharedPendingRafTimers.delete(id);
      if (typeof (globalThis as any).document === 'undefined') return;
      cb(Date.now());
    }, 0);
    sharedPendingRafTimers.add(id);
    return id;
  });
  setGlobalProp('cancelAnimationFrame', (id: any) => {
    sharedPendingRafTimers.delete(id);
    clearTimeout(id);
  });
  (dom.window as any).matchMedia = MockMatchMedia;
  (dom.window as any).ResizeObserver = MockResizeObserver;
  (dom.window as any).IntersectionObserver = MockIntersectionObserver;
  (dom.window as any).Image = MockImage;
  (dom.window as any).requestAnimationFrame = (globalThis as any).requestAnimationFrame;
  (dom.window as any).cancelAnimationFrame = (globalThis as any).cancelAnimationFrame;

  return {
    dom,
    store,
    clipboardWrites,
    setRemoveErrorForKey: (k) => {
      failRemoveKey = k;
    },
    setSetErrorForKey: (k) => {
      failSetKey = k;
    },
    cleanup: () => {
      clearSharedPendingRafTimers();
      resetMigrationSessionFlagForTests();
      dom.window.close();
      for (const [key, desc] of savedProps.entries()) {
        if (desc === undefined) {
          delete (globalThis as any)[key];
        } else {
          Object.defineProperty(globalThis, key, desc);
        }
      }
    },
  };
}

export async function runAppHooksRegressionCheck(): Promise<TestCaseResult> {
  const name = 'React App: переключение isProbeMode между рендерами не нарушает порядок/число хуков';
  const group = 'React Hooks (Этап 6)';

  const originalConsoleError = console.error;
  const consoleErrors: string[] = [];
  const ctx = setupReactDomTestEnv();

  try {
    console.error = (...args: any[]) => {
      const text = args.map((a) => (typeof a === 'string' ? a : String(a?.message || a))).join(' ');
      consoleErrors.push(text);
    };

    resetMigrationSessionFlagForTests();
    const [{ createRoot, flushSync }, { default: App }] = await Promise.all([
      getReactDomHelpers(),
      import('../../App'),
    ]);

    const container = ctx.dom.window.document.getElementById('root')!;
    const root = createRoot(container);

    const toggleTo = (hash: string) => {
      ctx.dom.window.location.hash = hash;
      flushSync(() => {
        ctx.dom.window.dispatchEvent(new ctx.dom.window.HashChangeEvent('hashchange'));
      });
    };

    // Рендер 1: основной режим (isProbeMode = false)
    flushSync(() => {
      root.render(React.createElement(App));
    });
    if (container.innerHTML.includes('Этап 1: Пиксельные маски')) {
      throw new Error('Ожидался основной интерфейс при пустом hash');
    }

    // Рендер 2: переключение в probe-режим (isProbeMode = true)
    toggleTo('#probe=regions');
    if (!container.innerHTML.includes('Этап 1: Пиксельные маски')) {
      throw new Error('Ожидался рендер RegionProbePage после #probe=regions');
    }

    // Рендер 3: возврат в основной режим (isProbeMode = false)
    toggleTo('');
    if (container.innerHTML.includes('Этап 1: Пиксельные маски')) {
      throw new Error('Ожидался возврат к MainAppContent после очистки hash');
    }

    // Рендер 4: повторное включение probe-режима
    toggleTo('#probe=regions');
    if (!container.innerHTML.includes('Этап 1: Пиксельные маски')) {
      throw new Error('Повторное переключение в RegionProbePage не сработало');
    }

    // Рендер 5: финальный возврат в основной режим
    toggleTo('');

    flushSync(() => {
      root.unmount();
    });

    const hookErrors = consoleErrors.filter(
      (msg) =>
        msg.toLowerCase().includes('hook') ||
        msg.toLowerCase().includes('rendered fewer') ||
        msg.toLowerCase().includes('rendered more')
    );
    if (hookErrors.length > 0) {
      throw new Error(`Обнаружены ошибки React hooks: ${hookErrors.join(' | ')}`);
    }

    return {
      group,
      name,
      passed: true,
      details: '5 последовательных рендеров (false -> true -> false -> true -> false) без ошибок хуков',
    };
  } catch (err: any) {
    return {
      group,
      name,
      passed: false,
      details: err?.message || String(err),
    };
  } finally {
    console.error = originalConsoleError;
    ctx.cleanup();
  }
}

export async function runStartupAndRecoveryScreenUiTests(): Promise<TestCaseResult> {
  const name =
    'UI восстановления: автостарт pending, экран блокировки при сбое/unknown, сырой экспорт и 2-шаговый сброс';
  const group = 'Восстановление в UI (Этап 7)';

  const originalConsoleError = console.error;
  try {
    console.error = () => {};

    const findButton = (container: HTMLElement, text: string): HTMLButtonElement | undefined =>
      Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent || '').includes(text)
      );

    // Сценарий A: pending при старте -> автовосстановление успешно -> запускается MainAppContent
    {
      const ctx = setupReactDomTestEnv();
      const [{ createRoot, flushSync }, { default: App }] = await Promise.all([
        getReactDomHelpers(),
        import('../../App'),
      ]);
      try {
        ctx.store.set('form_schema_version_v1', '11');
        StorageService.updateProfile({ name: 'Атлет Авто', age: 29 });
        const origProfile = ctx.store.get('form_user_profile')!;

        // Создаём реальный pending откат
        ctx.setSetErrorForKey('form_workout_programs');
        const failImp = StorageService.importBackupJsonWithResult(
          JSON.stringify({
            profile: { name: 'Сломанный', age: 88 },
            programs: [{ id: 'p_1', name: 'П', description: '', goal: 'Сила', daysPerWeek: 3, workouts: [] }],
          })
        );
        // Форсируем pending так, чтобы старт застал незавершённый маркер
        ctx.setSetErrorForKey(null);
        if (failImp.ok) {
          throw new Error('Ожидался отказ импорта для подготовки теста');
        }
        // Повторно создаём кейс с незавершённым откатом профиля
        ctx.store.set('form_schema_version_v1', '11');
        ctx.store.set('form_user_profile', origProfile);
        ctx.setRemoveErrorForKey(PENDING_ROLLBACK_KEY);
        StorageService.importBackupJsonWithResult(
          JSON.stringify({
            profile: { name: 'Сбой', age: 40 },
          })
        );
        ctx.setRemoveErrorForKey(null);
        resetMigrationSessionFlagForTests();

        const container = ctx.dom.window.document.getElementById('root')!;
        const root = createRoot(container);
        flushSync(() => {
          root.render(React.createElement(App));
        });

        if (container.querySelector('[role="dialog"]')) {
          throw new Error('При успешном автовосстановлении экран блокировки не должен появляться');
        }
        if (ctx.store.get(PENDING_ROLLBACK_KEY) !== undefined) {
          throw new Error('После успешного автовосстановления PENDING_ROLLBACK_KEY должен очиститься');
        }
        if (ctx.store.get('form_user_profile') !== origProfile) {
          throw new Error('После автовосстановления профиль должен остаться исходным');
        }
        flushSync(() => root.unmount());
      } finally {
        ctx.cleanup();
      }
    }

    // Сценарий B: pending при старте падает -> экран блокировки с «Повторить восстановление», затем успешный повтор -> MainAppContent
    {
      const ctx = setupReactDomTestEnv();
      const [{ createRoot, flushSync }, { default: App }] = await Promise.all([
        getReactDomHelpers(),
        import('../../App'),
      ]);
      try {
        ctx.store.set('form_schema_version_v1', '11');
        StorageService.updateProfile({ name: 'Атлет Повтор', age: 31 });
        const origProfile = ctx.store.get('form_user_profile')!;

        ctx.setRemoveErrorForKey(PENDING_ROLLBACK_KEY);
        StorageService.importBackupJsonWithResult(
          JSON.stringify({
            profile: { name: 'Временный', age: 41 },
          })
        );
        // Оставляем отказ удаления PENDING_ROLLBACK_KEY на старте -> автовосстановление должно провалиться
        resetMigrationSessionFlagForTests();

        const container = ctx.dom.window.document.getElementById('root')!;
        const root = createRoot(container);
        flushSync(() => {
          root.render(React.createElement(App));
        });

        const retryBtn = findButton(container, 'Повторить восстановление');
        if (!retryBtn) {
          throw new Error('При неудачном автовосстановлении pending обязана быть кнопка «Повторить восстановление»');
        }
        if (safeSetItem('form_app_settings_v1', '{"weightUnit":"lbs"}').ok) {
          throw new Error('Пока отображается экран pending, обычная запись обязана быть заблокирована');
        }

        // Устраняем сбой и жмём «Повторить восстановление»
        ctx.setRemoveErrorForKey(null);
        flushSync(() => {
          retryBtn.click();
        });

        if (container.querySelector('[role="dialog"]')) {
          throw new Error('После успешного ручного повтора экран блокировки должен закрыться');
        }
        if (ctx.store.get('form_user_profile') !== origProfile) {
          throw new Error('Профиль должен восстановиться полностью');
        }
        if (!safeSetItem('form_app_settings_v1', JSON.stringify({ weightUnit: 'kg' })).ok) {
          throw new Error('После восстановления обычная запись обязана снова работать');
        }
        flushSync(() => root.unmount());
      } finally {
        ctx.cleanup();
      }
    }

    // Сценарий C: unknown -> нет кнопки Повторить, сырой экспорт с битыми ключами, 2-шаговый сброс ТОЛЬКО служебных ключей
    {
      const ctx = setupReactDomTestEnv();
      const [{ createRoot, flushSync }, { default: App }] = await Promise.all([
        getReactDomHelpers(),
        import('../../App'),
      ]);
      try {
        ctx.store.set('form_schema_version_v1', '11');
        const userRaw = JSON.stringify({ name: 'Неприкосновенный Атлет', age: 34 });
        const workoutsCorruptRaw = '{corrupt_workouts_data';
        const quarantineRaw = '{corrupt_workouts_data';
        const brokenPending = '{corrupted_pending_json_verbatim';
        const prevSnapshot = '{"prev":"snap"}';

        ctx.store.set('form_user_profile', userRaw);
        ctx.store.set('form_workout_sessions', workoutsCorruptRaw);
        ctx.store.set(`${CORRUPTED_RAW_PREFIX}form_workout_sessions`, quarantineRaw);
        ctx.store.set(PENDING_ROLLBACK_KEY, brokenPending);
        ctx.store.set(ROLLBACK_SNAPSHOT_KEY, prevSnapshot);
        resetMigrationSessionFlagForTests();

        const container = ctx.dom.window.document.getElementById('root')!;
        const root = createRoot(container);
        flushSync(() => {
          root.render(React.createElement(App));
        });

        if (!container.querySelector('[role="dialog"]')) {
          throw new Error('При unknown обязан отображаться экран блокировки');
        }
        if (findButton(container, 'Повторить восстановление')) {
          throw new Error('В состоянии unknown кнопка «Повторить восстановление» должна быть недоступна');
        }
        const resetBtnDisabled = findButton(container, 'Сбросить состояние восстановления');
        if (!resetBtnDisabled || !resetBtnDisabled.disabled) {
          throw new Error('До сохранения/копирования копии кнопка сброса должна быть отключена');
        }
        if (safeSetItem('form_app_settings_v1', '{"weightUnit":"lbs"}').ok) {
          throw new Error('В состоянии unknown до сброса обычная запись заблокирована');
        }

        // Жмём «Сохранить копию данных»
        const saveCopyBtn = findButton(container, 'Сохранить копию данных');
        if (!saveCopyBtn) {
          throw new Error('Отсутствует кнопка «Сохранить копию данных»');
        }
        flushSync(() => {
          saveCopyBtn.click();
        });

        const textarea = container.querySelector('textarea') as HTMLTextAreaElement | null;
        if (!textarea) {
          throw new Error('После «Сохранить копию данных» обязан появиться textarea с сырым JSON для WebView');
        }
        const parsedDump = JSON.parse(textarea.value);
        if (
          parsedDump.rawKeys[PENDING_ROLLBACK_KEY] !== brokenPending ||
          parsedDump.rawKeys['form_workout_sessions'] !== workoutsCorruptRaw ||
          parsedDump.rawKeys['form_user_profile'] !== userRaw
        ) {
          throw new Error('Сырой дамп не содержит дословные пользовательские и повреждённые ключи');
        }

        const copyBtn = findButton(container, 'Копировать');
        if (!copyBtn) {
          throw new Error('Отсутствует кнопка «Копировать»');
        }
        await Promise.resolve(flushSync(() => {
          copyBtn.click();
        }));
        await new Promise((r) => setTimeout(r, 10));

        // Шаг 1 сброса
        const resetBtnEnabled = findButton(container, 'Сбросить состояние восстановления');
        if (!resetBtnEnabled || resetBtnEnabled.disabled) {
          throw new Error('После сохранения/копирования копии кнопка сброса должна стать активной');
        }
        flushSync(() => {
          resetBtnEnabled.click();
        });
        const step1Continue = findButton(container, 'Продолжить к подтверждению');
        if (!step1Continue) {
          throw new Error('Не показан шаг 1 предупреждения перед сбросом');
        }

        // До подтверждения шага 2 служебный маркер и блокировка ещё активны
        if (ctx.store.get(PENDING_ROLLBACK_KEY) !== brokenPending) {
          throw new Error('После шага 1 служебный ключ не должен быть удалён');
        }
        if (safeSetItem('form_app_settings_v1', '{"weightUnit":"lbs"}').ok) {
          throw new Error('До завершения 2-го шага запись должна оставаться заблокированной');
        }

        flushSync(() => {
          step1Continue.click();
        });

        // Шаг 2 сброса
        const confirmBtn = findButton(container, 'Подтвердить сброс');
        const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        if (!confirmBtn || !confirmBtn.disabled || !checkbox) {
          throw new Error('На шаге 2 кнопка подтверждения должна требовать отметку чекбокса');
        }
        flushSync(() => {
          checkbox.click();
        });
        flushSync(() => {
          confirmBtn.click();
        });

        // После подтверждения: экран закрылся, ТОЛЬКО служебные ключи удалены, пользовательские нетронуты
        if (container.querySelector('[role="dialog"]')) {
          throw new Error('После сброса экран блокировки должен закрыться');
        }
        if (
          ctx.store.get(PENDING_ROLLBACK_KEY) !== undefined ||
          ctx.store.get(ROLLBACK_SNAPSHOT_KEY) !== undefined ||
          ctx.store.get(ROLLBACK_SNAPSHOT_STAGING_KEY) !== undefined
        ) {
          throw new Error('После сброса служебные ключи восстановления должны быть удалены');
        }
        if (
          ctx.store.get('form_user_profile') !== userRaw ||
          ctx.store.get('form_workout_sessions') !== workoutsCorruptRaw ||
          ctx.store.get(`${CORRUPTED_RAW_PREFIX}form_workout_sessions`) !== quarantineRaw
        ) {
          throw new Error('Пользовательские данные и карантин обязаны остаться полностью нетронутыми после сброса');
        }
        if (!safeSetItem('form_app_settings_v1', JSON.stringify({ weightUnit: 'kg' })).ok) {
          throw new Error('После сброса обычная запись обязана снова работать');
        }

        flushSync(() => root.unmount());
        await new Promise((r) => setTimeout(r, 35));
      } finally {
        ctx.cleanup();
      }
    }

    return {
      group,
      name,
      passed: true,
      details: 'Проверены: автозапуск pending, отказ+ручной повтор pending, unknown без кнопки повтора, WebView-копирование и 2-шаговый сброс',
    };
  } catch (err: any) {
    return {
      group,
      name,
      passed: false,
      details: err?.message || String(err),
    };
  } finally {
    console.error = originalConsoleError;
  }
}

export async function runSafetyGuardUiIntegrationTests(): Promise<TestCaseResult> {
  const name =
    'UI Safety Guard (CR-001/CR-002/CR-003): каталог (раскрытая карточка), редактор targetWeight, устаревшая программа и запрет подтверждения при вето';
  const group = 'Safety Guard UI (QA-040)';

  const originalConsoleError = console.error;
  let prevSkipAnimations: boolean | undefined;
  try {
    console.error = () => {};
    const envInit = setupReactDomTestEnv();
    let ExerciseLibraryView: any;
    let ProgramEditorModal: any;
    let ActiveWorkoutModal: any;
    let AppComponent: any;
    let createRootFn: any;
    let flushSyncFn: any;
    let MotionGlobalConfigRef: any;
    try {
      const [{ createRoot, flushSync }, fm] = await Promise.all([
        getReactDomHelpers(),
        import('framer-motion'),
      ]);
      createRootFn = createRoot;
      flushSyncFn = flushSync;
      MotionGlobalConfigRef = fm.MotionGlobalConfig;
      prevSkipAnimations = MotionGlobalConfigRef.skipAnimations;
      MotionGlobalConfigRef.skipAnimations = true;

      [
        { ExerciseLibraryView },
        { ProgramEditorModal },
        { ActiveWorkoutModal },
        { default: AppComponent },
      ] = await Promise.all([
        import('../../components/ExerciseLibraryView'),
        import('../../components/ProgramEditorModal'),
        import('../../components/ActiveWorkoutModal'),
        import('../../App'),
      ]);
    } finally {
      await new Promise((r) => setTimeout(r, 20));
      envInit.cleanup();
    }
    const { formatLocalIsoDate } = await import('../dateUtils');
    const { HEALTH_RESTRICTION_PRESETS } = await import('../safetyGuard');

    const findButton = (container: HTMLElement, text: string): HTMLButtonElement | undefined =>
      Array.from(container.querySelectorAll('button')).find((b) =>
        (b.textContent || '').includes(text)
      );

    // 1. CR-001: Выбор заблокированного упражнения через раскрытую карточку ("Использовать это упражнение") и альтернативные кнопки невозможен
    {
      const ctx = setupReactDomTestEnv();
      const container = ctx.dom.window.document.getElementById('root')!;
      const root = createRootFn(container);
      let scenarioErr: unknown = null;
      try {
        ctx.store.set('form_schema_version_v1', '11');
        StorageService.updateProfile({ age: 28, weightKg: 80 });
        StorageService.saveUserParameters({
          goal: 'Сила',
          level: 'Средний',
          location: 'В зале',
          daysPerWeek: 3,
          durationMinutes: 60,
          availableDays: ['Пн', 'Ср', 'Пт'],
          preferredMuscles: ['chest', 'quads'],
          excludedExercises: ['Приседания со штангой'],
          healthRestrictions: [HEALTH_RESTRICTION_PRESETS.NO_AXIAL_SPINE_LOAD],
          notes: '',
        });

        let selectedNames: string[] = [];

        flushSyncFn(() => {
          root.render(
            React.createElement(ExerciseLibraryView, {
              selectionMode: true,
              onSelectExercise: (ex: any) => {
                selectedNames.push(ex.name);
              },
            })
          );
        });

        // Фильтруем заблокированное упражнение через поиск
        const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement;
        const setNativeVal = Object.getOwnPropertyDescriptor(
          ctx.dom.window.HTMLInputElement.prototype,
          'value'
        )!.set!;

        setNativeVal.call(searchInput, 'Приседания со штангой');
        flushSyncFn(() => {
          searchInput.dispatchEvent(new ctx.dom.window.Event('input', { bubbles: true }));
        });

        // Находим карточку «Приседания со штангой» и раскрываем её
        const titleEl = Array.from(container.querySelectorAll('h3')).find((h) =>
          (h.textContent || '').includes('Приседания со штангой')
        );
        if (!titleEl) {
          throw new Error('Карточка «Приседания со штангой» не найдена в ExerciseLibraryView');
        }

        // Проверяем верхнюю кнопку «Ограничено» (disabled)
        const topBlockedBtn = findButton(container, 'Ограничено');
        if (!topBlockedBtn || !topBlockedBtn.disabled) {
          throw new Error('Верхняя кнопка выбора заблокированного упражнения обязана быть disabled');
        }

        // Раскрываем карточку кликом
        flushSyncFn(() => {
          titleEl.click();
        });

        const expandedAlerts = Array.from(container.querySelectorAll('[role="alert"]'));
        if (expandedAlerts.length === 0) {
          throw new Error('В раскрытой карточке заблокированного упражнения должен отображаться reason (role=alert)');
        }

        const useBtn = Array.from(container.querySelectorAll('button')).find((b) =>
          (b.textContent || '').includes('Ограничено Safety Guard') ||
          (b.textContent || '').includes('Использовать это упражнение')
        );
        if (!useBtn || !useBtn.disabled) {
          throw new Error('Кнопка «Использовать это упражнение» внутри раскрытой карточки обязана быть disabled при блокировке');
        }

        // Пробуем кликнуть (включая симуляцию обхода атрибута disabled в DOM)
        useBtn.disabled = false;
        flushSyncFn(() => {
          useBtn.click();
        });
        if (selectedNames.length !== 0) {
          throw new Error(`Заблокированное упражнение выбрано в обход Safety Guard: ${selectedNames.join(', ')}`);
        }

        // Проверяем, что безопасное упражнение («Отжимания классические») выбирается без ложной блокировки
        setNativeVal.call(searchInput, 'Отжимания классические');
        flushSyncFn(() => {
          searchInput.dispatchEvent(new ctx.dom.window.Event('input', { bubbles: true }));
        });

        const safeTitle = Array.from(container.querySelectorAll('h3')).find((h) =>
          (h.textContent || '').trim() === 'Отжимания классические'
        );
        if (!safeTitle) {
          throw new Error('Безопасное упражнение «Отжимания классические» не найдено');
        }
        flushSyncFn(() => {
          safeTitle.click();
        });
        const safeUseBtn = findButton(container, 'Использовать это упражнение');
        if (!safeUseBtn || safeUseBtn.disabled) {
          throw new Error('Кнопка «Использовать это упражнение» для безопасного упражнения должна быть активна');
        }
        flushSyncFn(() => {
          safeUseBtn.click();
        });
        const afterSafeSelection = [...selectedNames];
        if (afterSafeSelection.length !== 1 || afterSafeSelection[0] !== 'Отжимания классические') {
          throw new Error('Безопасное упражнение должно выбираться нормально без ложных блокировок');
        }
      } catch (err) {
        scenarioErr = err;
      } finally {
        try {
          flushSyncFn(() => root.unmount());
        } catch {
          // ignore unmount failures
        }
        await new Promise((r) => setTimeout(r, 40));
        ctx.cleanup();
      }
      if (scenarioErr) throw scenarioErr;
    }

    // 2. CR-003 (UI): Попытка сохранения программы с недопустимым targetWeight в ProgramEditorModal
    {
      const ctx = setupReactDomTestEnv();
      const container = ctx.dom.window.document.getElementById('root')!;
      const root = createRootFn(container);
      let scenarioErr: unknown = null;
      try {
        ctx.store.set('form_schema_version_v1', '11');
        const todayIso = formatLocalIsoDate(new Date());
        StorageService.updateProfile({ age: 29, weightKg: 80 });
        StorageService.saveWorkoutSession({
          id: 'w_pe_prev',
          name: 'Жим',
          date: todayIso,
          startTime: '12:00',
          durationMinutes: 30,
          totalVolumeKg: 600,
          completedSets: 1,
          status: 'completed',
          exercises: [
            {
              id: 'e1',
              exerciseId: 'barbell_bench_press_flat',
              name: 'Жим штанги лёжа',
              targetMuscle: 'chest',
              isBodyweight: false,
              restSeconds: 90,
              sets: [{ setNumber: 1, weightKg: 60, reps: 10, completed: true }],
            },
          ],
        });

        let savedPrograms: any[] = [];
        const initialProgram = {
          id: 'prog_test_cr003',
          name: 'Тест программа',
          description: '',
          goal: 'Сила',
          daysPerWeek: 3,
          isCustom: true,
          workouts: [
            {
              id: 'day_1',
              dayName: 'День груди',
              exercises: [
                {
                  exerciseId: 'barbell_bench_press_flat',
                  name: 'Жим штанги лёжа',
                  targetMuscle: 'chest' as const,
                  isBodyweight: false,
                  sets: 3,
                  reps: 8,
                  targetWeight: 120,
                  restSeconds: 90,
                },
              ],
            },
          ],
        };

        flushSyncFn(() => {
          root.render(
            React.createElement(ProgramEditorModal, {
              initialProgram: initialProgram as any,
              onSave: (p: any) => savedPrograms.push(p),
              onClose: () => {},
            })
          );
        });

        const formEl = container.querySelector('form')!;
        flushSyncFn(() => {
          formEl.dispatchEvent(new ctx.dom.window.Event('submit', { bubbles: true, cancelable: true }));
        });

        if (savedPrograms.length !== 0) {
          throw new Error('ProgramEditorModal не должен сохранять программу с недопустимым targetWeight 120 кг');
        }
        if (!container.querySelector('[role="alert"]')) {
          throw new Error('При попытке сохранить программу с недопустимым targetWeight должно выводиться предупреждение Safety Guard');
        }

        // Меняем вес на допустимый 62.5 кг -> сохранение проходит!
        const weightInputs = Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
        const targetWeightInput = weightInputs.find((inp) => inp.step === '0.5');
        if (!targetWeightInput) {
          throw new Error('Поле ввода targetWeight не найдено в ProgramEditorModal');
        }
        const setNativeVal = Object.getOwnPropertyDescriptor(
          ctx.dom.window.HTMLInputElement.prototype,
          'value'
        )!.set!;
        setNativeVal.call(targetWeightInput, '62.5');
        flushSyncFn(() => {
          targetWeightInput.dispatchEvent(new ctx.dom.window.Event('input', { bubbles: true }));
        });

        flushSyncFn(() => {
          formEl.dispatchEvent(new ctx.dom.window.Event('submit', { bubbles: true, cancelable: true }));
        });

        const savedCount = [...savedPrograms].length;
        if (savedCount !== 1) {
          throw new Error('После исправления targetWeight на безопасные 62.5 кг программа обязана сохраняться');
        }
      } catch (err) {
        scenarioErr = err;
      } finally {
        try {
          flushSyncFn(() => root.unmount());
        } catch {
          // ignore unmount failures
        }
        await new Promise((r) => setTimeout(r, 40));
        ctx.cleanup();
      }
      if (scenarioErr) throw scenarioErr;
    }

    // 3. UI (ActiveWorkoutModal): Попытка подтвердить скачок веса при активном жёстком запрете (боль появилась перед подтверждением)
    {
      const ctx = setupReactDomTestEnv();
      const container = ctx.dom.window.document.getElementById('root')!;
      const root = createRootFn(container);
      let scenarioErr: unknown = null;
      try {
        ctx.store.set('form_schema_version_v1', '11');
        const now = new Date();
        const todayIso = formatLocalIsoDate(now);
        StorageService.updateProfile({ age: 29, weightKg: 80 });
        StorageService.saveWorkoutSession({
          id: 'w_awm_prev',
          name: 'Жим',
          date: todayIso,
          startTime: '11:00',
          durationMinutes: 30,
          totalVolumeKg: 800,
          completedSets: 1,
          status: 'completed',
          exercises: [
            {
              id: 'e1',
              exerciseId: 'barbell_bench_press_flat',
              name: 'Жим штанги лёжа',
              targetMuscle: 'chest',
              isBodyweight: false,
              restSeconds: 90,
              sets: [{ setNumber: 1, weightKg: 80, reps: 10, completed: true }],
            },
          ],
        });

        const session = {
          id: 's_awm_test',
          name: 'Тест',
          date: todayIso,
          startTime: '12:00',
          durationMinutes: 0,
          totalVolumeKg: 0,
          completedSets: 0,
          status: 'in_progress' as const,
          exercises: [
            {
              id: 'ex_awm_1',
              exerciseId: 'barbell_bench_press_flat',
              name: 'Жим штанги лёжа',
              targetMuscle: 'chest' as const,
              isBodyweight: false,
              requiredEquipment: 'barbell' as const,
              restSeconds: 90,
              sets: [{ setNumber: 1, weightKg: 80, reps: 10, completed: false }],
            },
          ],
        };

        flushSyncFn(() => {
          root.render(
            React.createElement(ActiveWorkoutModal, {
              session,
              onSave: () => ({ ok: true, error: null }),
              onCancel: () => {},
            })
          );
        });

        // Открываем модал редактирования веса и задаём 120 кг (чистый скачок +50%)
        const weightTileBtn = Array.from(container.querySelectorAll('button')).find((b) =>
          (b.title || '').includes('Нажмите для настройки веса')
        );
        if (!weightTileBtn) {
          throw new Error('Кнопка открытия редактирования веса не найдена в ActiveWorkoutModal');
        }
        flushSyncFn(() => {
          weightTileBtn.click();
        });

        const numInput = container.querySelector('input[type="number"]') as HTMLInputElement;
        const setNativeVal = Object.getOwnPropertyDescriptor(
          ctx.dom.window.HTMLInputElement.prototype,
          'value'
        )!.set!;
        setNativeVal.call(numInput, '120');
        flushSyncFn(() => {
          numInput.dispatchEvent(new ctx.dom.window.Event('input', { bubbles: true }));
        });

        const saveWeightBtn = findButton(container, 'Сохранить');
        if (!saveWeightBtn) {
          throw new Error('Кнопка «Сохранить» веса не найдена');
        }
        flushSyncFn(() => {
          saveWeightBtn.click();
        });

        // Открылся диалог «Подтвердите скачок веса» (портал в document.body) -> в этот момент появляется жёсткий запрет (боль 1/10)!
        const confirmJumpBtn = findButton(ctx.dom.window.document.body, 'Подтвердить вес');
        if (!confirmJumpBtn) {
          throw new Error('Ожидался модал подтверждения аномального скачка 80 -> 120 кг');
        }
        StorageService.saveWellbeingCheckin({
          id: 'wb_active_veto',
          date: todayIso,
          jointPain: 1,
          createdAt: Date.now(),
        });

        flushSyncFn(() => {
          confirmJumpBtn.click();
        });

        // Вес 120 кг не должен примениться в черновике!
        const draftAfter = StorageService.getActiveDraft();
        const appliedWeight = draftAfter?.exercises[0]?.sets[0]?.weightKg;
        if (appliedWeight !== 80) {
          throw new Error(`Подтверждение при активном вето не смеет менять вес с 80 на ${appliedWeight}`);
        }
        if (!container.querySelector('[role="alert"]')) {
          throw new Error('После отклонения подтверждения при жёстком запрете должно показаться уведомление Safety Guard');
        }
      } catch (err) {
        scenarioErr = err;
      } finally {
        try {
          flushSyncFn(() => root.unmount());
        } catch {
          // ignore unmount failures
        }
        await new Promise((r) => setTimeout(r, 40));
        ctx.cleanup();
      }
      if (scenarioErr) throw scenarioErr;
    }

    // 4. CR-003 (UI <App />): Запуск ранее сохранённой программы с устаревшим targetWeight при новых ограничениях (боль 1/10) блокируется Safety Guard
    {
      const ctx = setupReactDomTestEnv();
      resetMigrationSessionFlagForTests();
      const container = ctx.dom.window.document.getElementById('root')!;
      const root = createRootFn(container);
      let scenarioErr: unknown = null;
      try {
        ctx.store.set('form_schema_version_v1', '11');
        const todayIso = formatLocalIsoDate(new Date());
        StorageService.updateProfile({ age: 29, weightKg: 80 });
        StorageService.saveWorkoutSession({
          id: 'w_app_prev',
          name: 'Жим',
          date: todayIso,
          startTime: '10:00',
          durationMinutes: 30,
          totalVolumeKg: 600,
          completedSets: 1,
          status: 'completed',
          exercises: [
            {
              id: 'e1',
              exerciseId: 'barbell_bench_press_flat',
              name: 'Жим штанги лёжа',
              targetMuscle: 'chest',
              isBodyweight: false,
              restSeconds: 90,
              sets: [{ setNumber: 1, weightKg: 60, reps: 10, completed: true }],
            },
          ],
        });
        StorageService.saveProgram({
          id: 'prog_saved_cr003',
          name: 'Сохранённый сплит',
          description: 'Старая программа',
          goal: 'Сила',
          daysPerWeek: 3,
          status: 'active',
          isCustom: true,
          createdAt: todayIso,
          workouts: [
            {
              id: 'day_saved_1',
              dayName: 'День груди',
              targetMuscleGroups: ['chest'],
              estimatedDuration: 45,
              exercises: [
                {
                  exerciseId: 'barbell_bench_press_flat',
                  name: 'Жим штанги лёжа',
                  targetMuscle: 'chest',
                  isBodyweight: false,
                  sets: 3,
                  reps: 8,
                  targetWeight: 62.5,
                  restSeconds: 90,
                },
              ],
            },
          ],
        });
        // Новое ограничение самочувствия после сохранения программы
        StorageService.saveWellbeingCheckin({
          id: 'wb_app_stale',
          date: todayIso,
          jointPain: 1,
          createdAt: Date.now(),
        });

        flushSyncFn(() => {
          root.render(React.createElement(AppComponent));
        });

        // Нажимаем «НАЧАТЬ ТРЕНИРОВКУ» на главном экране для запуска ранее сохранённой программы
        const startWorkoutBtn = findButton(container, 'НАЧАТЬ ТРЕНИРОВКУ');
        if (!startWorkoutBtn) {
          throw new Error('Кнопка «НАЧАТЬ ТРЕНИРОВКУ» сохранённой программы не найдена в App');
        }
        flushSyncFn(() => {
          startWorkoutBtn.click();
        });

        const bodyText = ctx.dom.window.document.body.textContent || '';
        if (
          !bodyText.includes('Запуск «День груди» заблокирован') ||
          !bodyText.includes('Safety Guard: блокировка')
        ) {
          throw new Error('Запуск ранее сохранённой программы при новых ограничениях должен блокироваться Safety Guard');
        }
        if (StorageService.getActiveDraft()) {
          throw new Error('При блокировке запуска сохранённой программы активная сессия не должна создаваться');
        }
      } catch (err) {
        scenarioErr = err;
      } finally {
        try {
          flushSyncFn(() => root.unmount());
        } catch {
          // ignore unmount failures
        }
        await new Promise((r) => setTimeout(r, 40));
        ctx.cleanup();
      }
      if (scenarioErr) throw scenarioErr;
    }

    // 5. Wellbeing Relevance (UI <App />): Подтверждение устаревшей (>2 дн.) боли по зонам без автозапуска при других ограничениях
    {
      const ctx = setupReactDomTestEnv();
      resetMigrationSessionFlagForTests();
      const container = ctx.dom.window.document.getElementById('root')!;
      const root = createRootFn(container);
      let scenarioErr: unknown = null;
      try {
        ctx.store.set('form_schema_version_v1', '11');
        const now = new Date();
        const todayIso = formatLocalIsoDate(now);
        const fiveDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5, 12, 0, 0);
        const staleIso = formatLocalIsoDate(fiveDaysAgo);

        StorageService.updateProfile({ age: 30, weightKg: 80 });
        StorageService.saveProgram({
          id: 'prog_stale_pain_ui',
          name: 'Сплит проверки боли',
          description: 'Тест устаревшей боли',
          goal: 'Сила',
          daysPerWeek: 3,
          status: 'active',
          isCustom: true,
          createdAt: staleIso,
          workouts: [
            {
              id: 'day_stale_1',
              dayName: 'Силовая тренировка',
              targetMuscleGroups: ['chest', 'quads'],
              estimatedDuration: 45,
              exercises: [
                {
                  exerciseId: 'barbell_bench_press_flat',
                  name: 'Жим штанги лёжа',
                  targetMuscle: 'chest',
                  isBodyweight: false,
                  sets: 3,
                  reps: 8,
                  targetWeight: 0,
                  restSeconds: 90,
                },
                {
                  exerciseId: 'barbell_back_squats',
                  name: 'Приседания со штангой',
                  targetMuscle: 'quads',
                  isBodyweight: false,
                  sets: 3,
                  reps: 8,
                  targetWeight: 0,
                  restSeconds: 90,
                },
              ],
            },
          ],
        });

        // Устаревшая (5 дн.) боль сразу по двум зонам: chest: 3 и quads: 3
        StorageService.saveWellbeingCheckin({
          id: 'wb_stale_ui_1',
          date: staleIso,
          painByMuscle: { chest: 3, quads: 3 },
          createdAt: fiveDaysAgo.getTime(),
        });

        flushSyncFn(() => {
          root.render(React.createElement(AppComponent));
        });

        const startBtn = findButton(container, 'НАЧАТЬ ТРЕНИРОВКУ');
        if (!startBtn) {
          throw new Error('Кнопка «НАЧАТЬ ТРЕНИРОВКУ» не найдена для сценария устаревшей боли');
        }
        flushSyncFn(() => {
          startBtn.click();
        });

        const body = ctx.dom.window.document.body;
        if (!(body.textContent || '').includes('Устаревшая отметка о боли')) {
          throw new Error('В модале блокировки должен отображаться запрос подтверждения устаревшей боли');
        }

        // 1) Нажимаем «Боль сохраняется» по первой зоне (chest) -> дата обновляется на сегодня, но блокировка НЕ ослабляется
        const keepPainBtns = Array.from(body.querySelectorAll('button')).filter((b) =>
          (b.textContent || '').includes('Боль сохраняется')
        );
        if (keepPainBtns.length !== 2) {
          throw new Error(`Ожидались 2 кнопки «Боль сохраняется», найдено ${keepPainBtns.length}`);
        }
        flushSyncFn(() => {
          keepPainBtns[0].click();
        });

        const { getCurrentSafetyContext } = await import('../../services/safetyContext');
        const ctxAfterKeep = getCurrentSafetyContext(now);
        if (
          ctxAfterKeep.painByMuscle?.chest !== 3 ||
          ctxAfterKeep.painByMuscle?.quads !== 3 ||
          (ctxAfterKeep.stalePainAreas || []).length !== 1 ||
          ctxAfterKeep.stalePainAreas![0].zoneKey !== 'quads'
        ) {
          throw new Error('Подтверждение «Боль сохраняется» по chest должно освежить chest и оставить quads stale');
        }
        if (container.querySelector('[aria-label="Масштаб"]') || StorageService.getActiveDraft()) {
          throw new Error('После «Боль сохраняется» тренировка не смеет запускаться');
        }

        // 2) Нажимаем «Боль прошла (0)» по оставшейся устаревшей зоне (quads) -> chest: 3 всё ещё свежая, автозапуска быть НЕ ДОЛЖНО!
        const clearBtnsAfterKeep = Array.from(body.querySelectorAll('button')).filter((b) =>
          (b.textContent || '').includes('Боль прошла (0)')
        );
        if (clearBtnsAfterKeep.length !== 1) {
          throw new Error(`Ожидалась 1 кнопка «Боль прошла (0)» для quads, найдено ${clearBtnsAfterKeep.length}`);
        }
        flushSyncFn(() => {
          clearBtnsAfterKeep[0].click();
        });

        const ctxAfterPartialClear = getCurrentSafetyContext(now);
        if (
          ctxAfterPartialClear.painByMuscle?.quads !== undefined ||
          ctxAfterPartialClear.painByMuscle?.chest !== 3 ||
          ctxAfterPartialClear.wellbeingFreshnessStatus !== 'fresh'
        ) {
          throw new Error('Снятие quads: 0 должно сохранить свежую боль chest: 3');
        }
        if (!(body.textContent || '').includes('Safety Guard: блокировка') || StorageService.getActiveDraft()) {
          throw new Error('При сохранённой боли в груди частичное снятие quads не смеет запускать тренировку автоматически');
        }

        // 3) Сценарий чистого снятия последнего ограничения: закрываем модал, оставляем единственную устаревшую зону chest: 3 и подтверждаем «Боль прошла (0)»
        StorageService.saveWellbeingCheckin({
          id: 'wb_stale_ui_1',
          date: staleIso,
          painByMuscle: { chest: 3 },
          createdAt: fiveDaysAgo.getTime(),
        });
        // Оставляем только этот старый чекин с тем же chest: 3, удалив сегодняшний
        const todayRecords = StorageService.getWellbeingCheckins().filter((c) => c.date === todayIso);
        for (const r of todayRecords) {
          StorageService.deleteWellbeingCheckin(r.id);
        }

        const closeModalBtn = findButton(body, 'Закрыть');
        if (closeModalBtn) {
          flushSyncFn(() => {
            closeModalBtn.click();
          });
        }
        await new Promise((r) => setTimeout(r, 260));
        const restartBtn = findButton(container, 'НАЧАТЬ ТРЕНИРОВКУ');
        if (!restartBtn) {
          throw new Error('Кнопка «НАЧАТЬ ТРЕНИРОВКУ» не найдена для повторного открытия');
        }
        flushSyncFn(() => {
          restartBtn.click();
        });
        const finalClearBtn = findButton(body, 'Боль прошла (0)');
        if (!finalClearBtn) {
          throw new Error('Кнопка «Боль прошла (0)» не найдена при единственной устаревшей зоне');
        }
        flushSyncFn(() => {
          finalClearBtn.click();
        });
        await new Promise((r) => setTimeout(r, 260));

        // После снятия единственного ограничения повторная проверка Safety Guard прошла и тренировка открылась
        if ((body.textContent || '').includes('Safety Guard: блокировка')) {
          throw new Error('После снятия всех ограничений модал блокировки должен закрыться');
        }
        if (!(body.textContent || '').includes('Силовая тренировка') || !body.querySelector('[aria-label="Масштаб"]')) {
          throw new Error('После снятия последнего ограничения тренировка должна открыться');
        }
      } catch (err) {
        scenarioErr = err;
      } finally {
        try {
          flushSyncFn(() => root.unmount());
        } catch {
          // ignore unmount failures
        }
        await new Promise((r) => setTimeout(r, 40));
        ctx.cleanup();
      }
      if (scenarioErr) throw scenarioErr;
    }

    return {
      group,
      name,
      passed: true,
      details:
        'UI проверен: раскрытая карточка каталога, блокировка targetWeight в ProgramEditorModal, отказ запуска устаревшей программы в App, подтверждение устаревшей боли без автозапуска и отказ подтверждения при жёстком вето в ActiveWorkoutModal',
    };
  } catch (err: any) {
    return {
      group,
      name,
      passed: false,
      details: err?.message || String(err),
    };
  } finally {
    if (prevSkipAnimations !== undefined) {
      const { MotionGlobalConfig } = await import('framer-motion');
      MotionGlobalConfig.skipAnimations = prevSkipAnimations;
    }
    console.error = originalConsoleError;
  }
}

export async function runProgramGeneratorIntegrationTests(): Promise<TestCaseResult[]> {
  const { generateWorkoutProgram, generateLocalTemplateProgram } = await import(
    '../../services/programGenerator'
  );
  const { getUnifiedCatalog } = await import('../catalog');
  const { HEALTH_RESTRICTION_PRESETS } = await import('../safetyGuard');
  const { checkWorkoutLaunchSafety } = await import('../../services/safetyContext');

  const withMockEnv = async (
    fetchImpl: (input: any, init?: any) => Promise<any>,
    fn: () => Promise<void>
  ) => {
    const prevStorageDesc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const prevFetchDesc = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    const store = new Map<string, string>();
    const mockStorage: Storage = {
      get length() {
        return store.size;
      },
      clear() {
        store.clear();
      },
      getItem(k: string) {
        return store.has(k) ? store.get(k)! : null;
      },
      key(idx: number) {
        return Array.from(store.keys())[idx] ?? null;
      },
      removeItem(k: string) {
        store.delete(k);
      },
      setItem(k: string, v: string) {
        store.set(k, String(v));
      },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: mockStorage,
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchImpl,
    });
    resetMigrationSessionFlagForTests();

    try {
      await fn();
    } finally {
      resetMigrationSessionFlagForTests();
      if (prevStorageDesc) {
        Object.defineProperty(globalThis, 'localStorage', prevStorageDesc);
      } else {
        delete (globalThis as any).localStorage;
      }
      if (prevFetchDesc) {
        Object.defineProperty(globalThis, 'fetch', prevFetchDesc);
      } else {
        delete (globalThis as any).fetch;
      }
    }
  };

  const setSelectedEquipment = (ids: string[]) => {
    const current = StorageService.getEquipmentList();
    StorageService.saveEquipmentList(
      current.map((item) => ({
        ...item,
        selected: ids.includes(item.id),
      }))
    );
  };

  const runCase = async (name: string, fn: () => Promise<string>): Promise<TestCaseResult> => {
    try {
      const details = await fn();
      return { group: 'Program Generator (AI/Integration)', name, passed: true, details };
    } catch (err: any) {
      return {
        group: 'Program Generator (AI/Integration)',
        name,
        passed: false,
        details: err?.message || String(err),
      };
    }
  };

  const results: TestCaseResult[] = [];

  // 1. AI-путь: добавление валидных упражнений из каталога с нормализацией
  results.push(
    await runCase(
      'AI-путь принимает валидные упражнения из каталога и нормализует их поля',
      async () => {
        await withMockEnv(
          async () => ({
            ok: true,
            json: async () => ({
              success: true,
              program: {
                name: 'AI Сила',
                workouts: [
                  {
                    dayName: 'День 1',
                    targetMuscleGroups: ['chest', 'back'],
                    exercises: [
                      {
                        name: 'Жим штанги лежа',
                        targetMuscle: 'chest',
                        sets: 4,
                        reps: 8,
                        isBodyweight: true, // заведомо неверный флаг от AI — должен перезаписаться из каталога
                        restSeconds: 90,
                      },
                      {
                        name: 'Тяга штанги в наклоне',
                        targetMuscle: 'back',
                        sets: 4,
                        reps: 10,
                        restSeconds: 90,
                      },
                    ],
                  },
                ],
              },
            }),
          }),
          async () => {
            StorageService.updateProfile({ age: 30, weightKg: 80 });
            setSelectedEquipment(['barbell']);
            const res = await generateWorkoutProgram({
              goal: 'Сила',
              daysPerWeek: 2,
              duration: 60,
              experience: 'Средний',
              preferredDays: ['Пн', 'Чт'],
            });
            if (res.source !== 'ai') throw new Error(`Ожидался source=ai, получен ${res.source}`);
            const day1 = res.program.workouts[0];
            if (!day1 || day1.exercises.length !== 2) {
              throw new Error(`Ожидалось 2 упражнения, получено ${day1?.exercises.length}`);
            }
            if (day1.exercises[0].exerciseId !== 'barbell_bench_press_flat') {
              throw new Error(`Неверный exerciseId: ${day1.exercises[0].exerciseId}`);
            }
            if (day1.exercises[0].isBodyweight !== false) {
              throw new Error('isBodyweight должен браться из каталога, а не из сырого ответа AI');
            }
            if (day1.exercises[0].targetWeight !== 0) {
              throw new Error('targetWeight в шаблоне должен быть 0');
            }
            if (day1.targetMuscleGroups[1] !== 'lats') {
              throw new Error(`Ожидалась нормализация 'back' -> 'lats', получено ${day1.targetMuscleGroups[1]}`);
            }
          }
        );
        return 'Валидные упражнения AI подтверждены по каталогу';
      }
    )
  );

  // 2. AI-путь: отклонение вымышленных упражнений и частичных совпадений вне каталога
  results.push(
    await runCase(
      'AI-путь отклоняет вымышленные упражнения и частичные совпадения вне каталога',
      async () => {
        await withMockEnv(
          async () => ({
            ok: true,
            json: async () => ({
              success: true,
              program: {
                name: 'AI Mixed',
                workouts: [
                  {
                    dayName: 'День 1',
                    targetMuscleGroups: ['quads', 'chest'],
                    exercises: [
                      { name: 'Приседания с гантелями', targetMuscle: 'quads', sets: 3, reps: 12 },
                      { name: 'Космический жим гантелей Х99', targetMuscle: 'chest', sets: 4, reps: 10 },
                      { name: 'Приседания', targetMuscle: 'quads', sets: 3, reps: 10 },
                    ],
                  },
                ],
              },
            }),
          }),
          async () => {
            StorageService.updateProfile({ age: 28, weightKg: 75 });
            setSelectedEquipment(['dumbbells_adjustable']);
            const res = await generateWorkoutProgram({
              goal: 'Развитие мышц',
              daysPerWeek: 2,
              duration: 60,
              experience: 'Средний',
              preferredDays: ['Пн', 'Чт'],
            });
            const exList = res.program.workouts.flatMap((w) => w.exercises);
            if (exList.length !== 1 || exList[0].name !== 'Приседания с гантелями') {
              throw new Error(
                `Должно остаться только 1 подтверждённое упражнение, получено: ${exList.map((e) => e.name).join(', ')}`
              );
            }
            if (exList.some((e) => (e.exerciseId || '').startsWith('ex_gen_'))) {
              throw new Error('Запрещено генерировать фиктивные ID ex_gen_*');
            }
          }
        );
        return 'Вымышленные и частичные названия AI отфильтрованы';
      }
    )
  );

  // 3. AI-путь: отклонение упражнений с отсутствующим оборудованием и допустимая замена
  results.push(
    await runCase(
      'AI-путь отклоняет упражнения без доступного оборудования и заменяет только допустимыми из каталога',
      async () => {
        await withMockEnv(
          async () => ({
            ok: true,
            json: async () => ({
              success: true,
              program: {
                name: 'AI Equipment Test',
                workouts: [
                  {
                    dayName: 'День 1',
                    targetMuscleGroups: ['chest', 'quads'],
                    exercises: [
                      { name: 'Жим штанги лёжа', targetMuscle: 'chest', sets: 4, reps: 8 },
                      { name: 'Приседания со штангой', targetMuscle: 'quads', sets: 4, reps: 8 },
                    ],
                  },
                ],
              },
            }),
          }),
          async () => {
            StorageService.updateProfile({ age: 30, weightKg: 80 });
            setSelectedEquipment(['dumbbells_adjustable']);
            const res = await generateWorkoutProgram({
              goal: 'Сила',
              daysPerWeek: 2,
              duration: 60,
              experience: 'Средний',
              preferredDays: ['Пн', 'Чт'],
            });
            const exList = res.program.workouts.flatMap((w) => w.exercises);
            if (exList.length === 0) {
              throw new Error('Для dumbbells_adjustable должны подбираться допустимые замены из каталога');
            }
            for (const ex of exList) {
              if (ex.name === 'Жим штанги лёжа' || ex.name === 'Приседания со штангой') {
                throw new Error(`Упражнение со штангой ${ex.name} не должно было пройти при наличии только гантелей`);
              }
              if (ex.requiredEquipment !== 'dumbbells_adjustable') {
                throw new Error(`Замена ${ex.name} требует ${ex.requiredEquipment}, а не dumbbells_adjustable`);
              }
            }
          }
        );
        return 'Упражнения с отсутствующим оборудованием отклонены и безопасно заменены';
      }
    )
  );

  // 4. AI-путь: блокировка по Safety Guard и отказ при отсутствии альтернатив / оборудования
  results.push(
    await runCase(
      'AI-путь уважает Safety Guard и корректно сообщает об ошибке при отсутствии альтернатив или оборудования',
      async () => {
        // А) Safety Guard блокирует приседания и боль/исключения -> AI не добавляет запрещённые упражнения
        await withMockEnv(
          async () => ({
            ok: true,
            json: async () => ({
              success: true,
              program: {
                name: 'AI Safety',
                workouts: [
                  {
                    dayName: 'День 1',
                    targetMuscleGroups: ['quads', 'chest'],
                    exercises: [
                      { name: 'Приседания со штангой', targetMuscle: 'quads', sets: 3, reps: 8 },
                      { name: 'Жим штанги лёжа', targetMuscle: 'chest', sets: 3, reps: 8 },
                      { name: 'Румынская тяга со штангой', targetMuscle: 'hamstrings', sets: 3, reps: 10 },
                    ],
                  },
                ],
              },
            }),
          }),
          async () => {
            StorageService.updateProfile({ age: 30, weightKg: 80 });
            setSelectedEquipment(['barbell']);
            StorageService.saveUserParameters({
              ...StorageService.getUserParameters(),
              excludedExercises: ['Жим штанги лёжа'],
              healthRestrictions: [HEALTH_RESTRICTION_PRESETS.PROTECT_KNEES],
            });
            const res = await generateWorkoutProgram({
              goal: 'Сила',
              daysPerWeek: 2,
              duration: 60,
              experience: 'Средний',
              preferredDays: ['Пн', 'Чт'],
            });
            const names = res.program.workouts.flatMap((w) => w.exercises.map((e) => e.name));
            if (names.includes('Приседания со штангой')) {
              throw new Error('PROTECT_KNEES должен блокировать Приседания со штангой в AI-программе');
            }
            if (names.includes('Жим штанги лёжа')) {
              throw new Error('excludedExercises должен блокировать Жим штанги лёжа в AI-программе');
            }
            const safety = checkWorkoutLaunchSafety(res.program.workouts.flatMap((w) => w.exercises));
            if (!safety.allowed) {
              throw new Error(`Итоговая AI-программа не прошла Safety Guard: ${safety.vetoReasons.join('; ')}`);
            }
          }
        );

        // Б) AI вернул только недопустимые упражнения без альтернатив (jump_rope + AVOID_SHARP_JUMPS) -> явная ошибка
        await withMockEnv(
          async () => ({
            ok: true,
            json: async () => ({
              success: true,
              program: {
                name: 'AI Empty Fail',
                workouts: [
                  {
                    dayName: 'День 1',
                    targetMuscleGroups: ['calves'],
                    exercises: [{ name: 'Прыжки на скакалке', targetMuscle: 'calves', sets: 3, reps: 50 }],
                  },
                ],
              },
            }),
          }),
          async () => {
            StorageService.updateProfile({ age: 30, weightKg: 80 });
            setSelectedEquipment(['jump_rope']);
            StorageService.saveUserParameters({
              ...StorageService.getUserParameters(),
              healthRestrictions: [HEALTH_RESTRICTION_PRESETS.AVOID_SHARP_JUMPS],
            });
            let failedCleanly = false;
            try {
              await generateWorkoutProgram({
                goal: 'Выносливость',
                daysPerWeek: 2,
                duration: 45,
                experience: 'Средний',
                preferredDays: ['Пн', 'Чт'],
              });
            } catch (err: any) {
              failedCleanly = String(err?.message || '').includes('Не удалось составить программу');
            }
            if (!failedCleanly) {
              throw new Error('AI-путь при отсутствии безопасных альтернатив должен выбросить понятную ошибку, а не вернуть пустую программу');
            }
          }
        );

        // В) Пустой инвентарь при фолбэке на локальный генератор -> явная ошибка, без подстановки bodyweight
        await withMockEnv(
          async () => ({
            ok: true,
            json: async () => ({ success: false, fallback: true }),
          }),
          async () => {
            StorageService.updateProfile({ age: 30, weightKg: 80 });
            setSelectedEquipment([]);
            let failedNoEquip = false;
            try {
              await generateWorkoutProgram({
                goal: 'Сила',
                daysPerWeek: 3,
                duration: 60,
                experience: 'Средний',
                preferredDays: ['Пн', 'Ср', 'Пт'],
              });
            } catch (err: any) {
              failedNoEquip = String(err?.message || '').includes('инвентарь');
            }
            if (!failedNoEquip) {
              throw new Error('generateWorkoutProgram с пустым инвентарём обязан возвращать ошибку выбора оборудования');
            }
          }
        );

        return 'Safety Guard и отказ при отсутствии альтернатив/инвентаря в AI-пути подтверждены';
      }
    )
  );

  // 5. Согласованность (паритет) правил AI-пути и локального пути
  results.push(
    await runCase(
      'Единый конвейер обеспечивает паритет каталога, оборудования и Safety Guard между AI и локальным путём',
      async () => {
        await withMockEnv(
          async () => ({
            ok: true,
            json: async () => ({
              success: true,
              program: {
                name: 'AI Parity',
                workouts: [
                  {
                    dayName: 'День 1',
                    targetMuscleGroups: ['lats', 'quads', 'chest'],
                    exercises: [
                      { name: 'Тяга гантели одной рукой', targetMuscle: 'lats', sets: 3, reps: 10 },
                      { name: 'Подтягивания широким хватом', targetMuscle: 'lats', sets: 3, reps: 8 },
                      { name: 'Жим штанги лёжа', targetMuscle: 'chest', sets: 3, reps: 8 },
                      { name: 'Приседания с гантелями', targetMuscle: 'quads', sets: 3, reps: 10 },
                      { name: 'Выдуманное упражнение', targetMuscle: 'chest', sets: 3, reps: 10 },
                    ],
                  },
                ],
              },
            }),
          }),
          async () => {
            StorageService.updateProfile({ age: 32, weightKg: 82 });
            const allowedEq = ['dumbbells_adjustable', 'pullup_bar'];
            setSelectedEquipment(allowedEq);
            StorageService.saveUserParameters({
              ...StorageService.getUserParameters(),
              excludedExercises: ['Подтягивания широким хватом'],
              healthRestrictions: [HEALTH_RESTRICTION_PRESETS.PROTECT_KNEES],
            });

            const params = {
              goal: 'Развитие мышц',
              daysPerWeek: 3,
              duration: 60,
              experience: 'Средний',
              preferredDays: ['Пн', 'Ср', 'Пт'],
            };

            const aiResult = await generateWorkoutProgram(params);
            const localResult = generateLocalTemplateProgram(params);

            const catalogIds = new Set(getUnifiedCatalog([]).map((e) => e.id));
            for (const [label, prog] of [
              ['AI', aiResult.program],
              ['Local', localResult],
            ] as const) {
              const allEx = prog.workouts.flatMap((w) => w.exercises);
              if (allEx.length === 0) {
                throw new Error(`${label}: программа не должна быть пустой`);
              }
              for (const ex of allEx) {
                if (!ex.exerciseId || !catalogIds.has(ex.exerciseId)) {
                  throw new Error(`${label}: ${ex.name} не из каталога`);
                }
                if (!allowedEq.includes(ex.requiredEquipment || '')) {
                  throw new Error(`${label}: ${ex.name} использует недоступное оборудование ${ex.requiredEquipment}`);
                }
                if (ex.name === 'Подтягивания широким хватом' || ex.name === 'Приседания с гантелями') {
                  throw new Error(`${label}: запрещённое упражнение ${ex.name} прошло фильтр`);
                }
              }
              const safety = checkWorkoutLaunchSafety(allEx);
              if (!safety.allowed) {
                throw new Error(`${label}: не пройдена итоговая проверка Safety Guard: ${safety.vetoReasons.join('; ')}`);
              }
            }

            // Валидное упражнение 'Тяга гантели одной рукой' не должно быть ложно заблокировано ни в одном из путей
            const aiNames = aiResult.program.workouts.flatMap((w) => w.exercises.map((e) => e.name));
            if (!aiNames.includes('Тяга гантели одной рукой')) {
              throw new Error('AI-путь ложно заблокировал валидное упражнение Тяга гантели одной рукой');
            }
          }
        );
        return 'Оба пути соблюдают идентичные правила без ложных блокировок';
      }
    )
  );

  return results;
}

export async function runActiveWorkoutAutosaveTests(): Promise<TestCaseResult[]> {
  const group = 'ActiveWorkoutModal Autosave';
  const results: TestCaseResult[] = [];

  const originalConsoleError = console.error;
  let prevSkipAnimations: boolean | undefined;

  try {
    console.error = () => {};
    const envInit = setupReactDomTestEnv();
    let ActiveWorkoutModal: any;
    let AUTOSAVE_DEBOUNCE_MS = 300;
    let createRootFn: any;
    let flushSyncFn: any;

    try {
      const [{ createRoot, flushSync }, fm, mod] = await Promise.all([
        getReactDomHelpers(),
        import('framer-motion'),
        import('../../components/ActiveWorkoutModal'),
      ]);
      createRootFn = createRoot;
      flushSyncFn = flushSync;
      prevSkipAnimations = fm.MotionGlobalConfig.skipAnimations;
      fm.MotionGlobalConfig.skipAnimations = true;
      ActiveWorkoutModal = mod.ActiveWorkoutModal;
      AUTOSAVE_DEBOUNCE_MS = mod.AUTOSAVE_DEBOUNCE_MS ?? 300;
    } finally {
      await new Promise((r) => setTimeout(r, 20));
      envInit.cleanup();
    }

    const { formatLocalIsoDate } = await import('../dateUtils');

    const createTestSession = () => ({
      id: `sess_autosave_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: 'Жимовой день',
      date: formatLocalIsoDate(new Date()),
      startTime: '12:00',
      durationMinutes: 0,
      totalVolumeKg: 0,
      completedSets: 0,
      status: 'in_progress' as const,
      exercises: [
        {
          id: 'ex_as_1',
          exerciseId: 'barbell_bench_press_flat',
          name: 'Жим штанги лёжа',
          targetMuscle: 'chest' as const,
          isBodyweight: false,
          requiredEquipment: 'barbell' as const,
          restSeconds: 90,
          sets: [
            { setNumber: 1, weightKg: 80, reps: 10, completed: false },
            { setNumber: 2, weightKg: 80, reps: 10, completed: false },
          ],
        },
      ],
    });

    const getControls = (doc: Document, rootEl: HTMLElement) => {
      const allBtns = Array.from(rootEl.querySelectorAll('button')) as HTMLButtonElement[];
      const statusEl = rootEl.querySelector('[data-testid="autosave-status"]');
      const weightPlusBtn = allBtns.find(
        (b) =>
          (b.textContent || '').trim() === '+' &&
          (b.parentElement?.textContent || '').includes('Вес:')
      );
      const repsPlusBtn = allBtns.find(
        (b) =>
          (b.textContent || '').trim() === '+' &&
          (b.parentElement?.textContent || '').includes('Повт:')
      );
      const set1Btn = rootEl.querySelector(
        'button[aria-label="Подход 1"]'
      ) as HTMLButtonElement | null;
      const closeBtn = rootEl.querySelector(
        'button[aria-label="Прервать тренировку"]'
      ) as HTMLButtonElement | null;
      const finishBtn = allBtns.find((b) => (b.textContent || '').trim() === 'Готово');
      const findBodyButton = (label: string) =>
        Array.from(doc.body.querySelectorAll('button')).find((b) =>
          (b.textContent || '').includes(label)
        ) as HTMLButtonElement | undefined;

      return {
        statusEl,
        statusText: () => (statusEl?.textContent || '').trim(),
        weightPlusBtn,
        repsPlusBtn,
        set1Btn,
        closeBtn,
        finishBtn,
        findBodyButton,
      };
    };

    const runScenario = async (name: string, fn: () => Promise<string>) => {
      try {
        const details = await fn();
        results.push({ group, name, passed: true, details });
      } catch (err: any) {
        results.push({
          group,
          name,
          passed: false,
          details: err?.message || String(err),
        });
      }
    };

    // 1. Debounce 300 мс и переходы статусов «Сохранение…» -> «Сохранено»
    await runScenario(
      'Debounce 300 мс объединяет частые правки и корректно переключает статусы «Сохранение…» -> «Сохранено»',
      async () => {
        const ctx = setupReactDomTestEnv();
        const container = ctx.dom.window.document.getElementById('root')!;
        const root = createRootFn(container);
        const origSaveDraft = StorageService.saveActiveDraft.bind(StorageService);
        const tracker: { saveCallsAfterMount: number } = { saveCallsAfterMount: 0 };

        try {
          ctx.store.set('form_schema_version_v1', '11');
          StorageService.updateProfile({ age: 30, weightKg: 80 });
          const session = createTestSession();

          flushSyncFn(() => {
            root.render(
              React.createElement(ActiveWorkoutModal, {
                session,
                onSave: () => ({ ok: true, error: null }),
                onCancel: () => {},
              })
            );
          });
          await new Promise((r) => setTimeout(r, 25));

          const controls = getControls(ctx.dom.window.document, container);
          if (controls.statusText() !== 'Сохранено') {
            throw new Error(
              `После начальной синхронизации ожидался статус «Сохранено», получено: «${controls.statusText()}»`
            );
          }

          StorageService.saveActiveDraft = (draft: any) => {
            tracker.saveCallsAfterMount += 1;
            return origSaveDraft(draft);
          };

          if (!controls.weightPlusBtn || !controls.repsPlusBtn || !controls.set1Btn) {
            throw new Error('Не найдены элементы управления весом/повторениями/подходом');
          }

          // Серия из 4 быстрых изменений в пределах <50 мс
          flushSyncFn(() => controls.weightPlusBtn!.click()); // 80 -> 82.5
          flushSyncFn(() => controls.weightPlusBtn!.click()); // 82.5 -> 85
          flushSyncFn(() => controls.repsPlusBtn!.click()); // 10 -> 11
          flushSyncFn(() => controls.set1Btn!.click()); // set 1 completed = true

          if (!controls.statusText().includes('Сохранение…')) {
            throw new Error(
              `Во время debounce ожидался статус «Сохранение…», получено: «${controls.statusText()}»`
            );
          }
          if (Number(tracker.saveCallsAfterMount) !== 0) {
            throw new Error(
              `До истечения ${AUTOSAVE_DEBOUNCE_MS} мс не должно быть немедленной записи (вызовов: ${tracker.saveCallsAfterMount})`
            );
          }

          // Проверяем на середине окна (140 мс < 300 мс)
          await new Promise((r) => setTimeout(r, 140));
          if (Number(tracker.saveCallsAfterMount) !== 0 || !controls.statusText().includes('Сохранение…')) {
            throw new Error('На 140 мс debounce ещё не должен срабатывать');
          }

          // Ждём завершения debounce (+запас на таймер)
          await new Promise((r) => setTimeout(r, AUTOSAVE_DEBOUNCE_MS + 80));
          if (Number(tracker.saveCallsAfterMount) !== 1) {
            throw new Error(
              `Серия из 4 быстрых правок должна объединяться в 1 запись, фактически: ${tracker.saveCallsAfterMount}`
            );
          }
          if (controls.statusText() !== 'Сохранено') {
            throw new Error(
              `После завершения автосохранения ожидался статус «Сохранено», получено: «${controls.statusText()}»`
            );
          }

          const draft = StorageService.getActiveDraft();
          const savedSet = draft?.exercises?.[0]?.sets?.[0];
          if (!savedSet || savedSet.weightKg !== 85 || savedSet.reps !== 11 || !savedSet.completed) {
            throw new Error(
              `Ожидались итоговые значения (85 кг × 11, completed=true), получено: ${JSON.stringify(savedSet)}`
            );
          }

          return `4 правки объединены в 1 запись после ${AUTOSAVE_DEBOUNCE_MS} мс`;
        } finally {
          StorageService.saveActiveDraft = origSaveDraft;
          try {
            flushSyncFn(() => root.unmount());
          } catch {
            // ignore
          }
          await new Promise((r) => setTimeout(r, 30));
          ctx.cleanup();
        }
      }
    );

    // 2. Закрытие модального окна и размонтирование до истечения 300 мс не теряют последние правки
    await runScenario(
      'Закрытие модального окна («Прервать тренировку») и unmount сбрасывают pending-правки без потери данных',
      async () => {
        // 2А: закрытие через подтверждение «Прервать тренировку»
        {
          const ctx = setupReactDomTestEnv();
          const container = ctx.dom.window.document.getElementById('root')!;
          const root = createRootFn(container);
          let draftSeenInsideOnCancel: any = null;

          try {
            ctx.store.set('form_schema_version_v1', '11');
            StorageService.updateProfile({ age: 30, weightKg: 80 });
            const session = createTestSession();

            flushSyncFn(() => {
              root.render(
                React.createElement(ActiveWorkoutModal, {
                  session,
                  onSave: () => ({ ok: true, error: null }),
                  onCancel: () => {
                    draftSeenInsideOnCancel = StorageService.getActiveDraft();
                  },
                })
              );
            });
            await new Promise((r) => setTimeout(r, 25));

            const controls = getControls(ctx.dom.window.document, container);
            flushSyncFn(() => controls.weightPlusBtn!.click()); // 80 -> 82.5
            flushSyncFn(() => controls.repsPlusBtn!.click()); // 10 -> 11

            if (!controls.statusText().includes('Сохранение…')) {
              throw new Error('Перед закрытием должен быть активен статус «Сохранение…»');
            }

            // Мгновенно закрываем окно до истечения 300 мс
            flushSyncFn(() => controls.closeBtn!.click());
            const confirmAbortBtn = Array.from(
              ctx.dom.window.document.body.querySelectorAll('button')
            ).find((b) => (b.textContent || '').trim() === 'Прервать тренировку') as
              | HTMLButtonElement
              | undefined;
            if (!confirmAbortBtn) {
              throw new Error('Кнопка подтверждения «Прервать тренировку» не найдена');
            }
            flushSyncFn(() => confirmAbortBtn.click());

            const savedSet = draftSeenInsideOnCancel?.exercises?.[0]?.sets?.[0];
            if (!savedSet || savedSet.weightKg !== 82.5 || savedSet.reps !== 11) {
              throw new Error(
                `При мгновенном закрытии потеряны последние правки: ${JSON.stringify(savedSet)}`
              );
            }
          } finally {
            try {
              flushSyncFn(() => root.unmount());
            } catch {
              // ignore
            }
            await new Promise((r) => setTimeout(r, 30));
            ctx.cleanup();
          }
        }

        // 2Б: прямое размонтирование компонента (unmount) до истечения 300 мс
        {
          const ctx = setupReactDomTestEnv();
          const container = ctx.dom.window.document.getElementById('root')!;
          const root = createRootFn(container);

          try {
            ctx.store.set('form_schema_version_v1', '11');
            StorageService.updateProfile({ age: 30, weightKg: 80 });
            const session = createTestSession();

            flushSyncFn(() => {
              root.render(
                React.createElement(ActiveWorkoutModal, {
                  session,
                  onSave: () => ({ ok: true, error: null }),
                  onCancel: () => {},
                })
              );
            });
            await new Promise((r) => setTimeout(r, 25));

            const controls = getControls(ctx.dom.window.document, container);
            flushSyncFn(() => controls.weightPlusBtn!.click()); // 80 -> 82.5
            flushSyncFn(() => controls.set1Btn!.click()); // completed = true

            // Размонтируем до истечения 300 мс
            flushSyncFn(() => root.unmount());

            const draftAfterUnmount = StorageService.getActiveDraft();
            const savedSet = draftAfterUnmount?.exercises?.[0]?.sets?.[0];
            if (!savedSet || savedSet.weightKg !== 82.5 || !savedSet.completed) {
              throw new Error(
                `При unmount до 300 мс потеряны изменения: ${JSON.stringify(savedSet)}`
              );
            }
          } finally {
            await new Promise((r) => setTimeout(r, AUTOSAVE_DEBOUNCE_MS + 60));
            ctx.cleanup();
          }
        }

        return 'Закрытие через подтверждение и unmount синхронно дозаписывают актуальный черновик';
      }
    );

    // 3. Завершение тренировки во время pending debounce сохраняет свежие данные и не воскрешает черновик
    await runScenario(
      'Завершение тренировки до 300 мс отменяет таймер, сохраняет актуальные правки в историю и не воскрешает черновик',
      async () => {
        const ctx = setupReactDomTestEnv();
        const container = ctx.dom.window.document.getElementById('root')!;
        const root = createRootFn(container);

        try {
          ctx.store.set('form_schema_version_v1', '11');
          StorageService.updateProfile({ age: 30, weightKg: 80 });
          const session = createTestSession();

          flushSyncFn(() => {
            root.render(
              React.createElement(ActiveWorkoutModal, {
                session,
                onSave: (completed: any) => StorageService.saveWorkoutSession(completed),
                onCancel: () => {},
              })
            );
          });
          await new Promise((r) => setTimeout(r, 25));

          const controls = getControls(ctx.dom.window.document, container);
          flushSyncFn(() => controls.weightPlusBtn!.click()); // 80 -> 82.5
          flushSyncFn(() => controls.set1Btn!.click()); // set 1 completed

          if (!controls.statusText().includes('Сохранение…')) {
            throw new Error('Перед завершением должен быть pending-таймер («Сохранение…»)');
          }

          flushSyncFn(() => controls.finishBtn!.click());
          const confirmFinishBtn = controls.findBodyButton('Подтвердить и сохранить в историю');
          if (!confirmFinishBtn) {
            throw new Error('Кнопка «Подтвердить и сохранить в историю» не найдена');
          }
          flushSyncFn(() => confirmFinishBtn.click());

          const savedSessions = StorageService.getWorkoutSessions();
          const completed = savedSessions.find((s) => s.id === session.id);
          const completedSet = completed?.exercises?.[0]?.sets?.[0];
          if (!completedSet || completedSet.weightKg !== 82.5 || !completedSet.completed) {
            throw new Error(
              `Завершённая сессия не содержит последние pending-правки: ${JSON.stringify(completedSet)}`
            );
          }

          if (StorageService.getActiveDraft() !== null) {
            throw new Error('После сохранения завершённой тренировки черновик должен быть очищен');
          }

          // Ждём дольше 300 мс и убеждаемся, что старый таймер был отменён и не воскресил черновик
          await new Promise((r) => setTimeout(r, AUTOSAVE_DEBOUNCE_MS + 90));
          if (StorageService.getActiveDraft() !== null) {
            throw new Error('Отложенный таймер автосохранения воскресил черновик после завершения тренировки!');
          }

          return 'Таймер отменён, история получила правки, черновик не воскрешён после 390 мс';
        } finally {
          try {
            flushSyncFn(() => root.unmount());
          } catch {
            // ignore
          }
          await new Promise((r) => setTimeout(r, 30));
          ctx.cleanup();
        }
      }
    );

    // 4. Ошибка сохранения: статус «Ошибка сохранения», alert и восстановление при повторе
    await runScenario(
      'При сбое saveActiveDraft отображается статус «Ошибка сохранения» с возможностью восстановления',
      async () => {
        const ctx = setupReactDomTestEnv();
        const container = ctx.dom.window.document.getElementById('root')!;
        const root = createRootFn(container);
        const origSaveDraft = StorageService.saveActiveDraft.bind(StorageService);

        try {
          ctx.store.set('form_schema_version_v1', '11');
          StorageService.updateProfile({ age: 30, weightKg: 80 });
          const session = createTestSession();

          flushSyncFn(() => {
            root.render(
              React.createElement(ActiveWorkoutModal, {
                session,
                onSave: () => ({ ok: true, error: null }),
                onCancel: () => {},
              })
            );
          });
          await new Promise((r) => setTimeout(r, 25));

          const controls = getControls(ctx.dom.window.document, container);

          // Имитируем ошибку квоты памяти на следующее сохранение
          StorageService.saveActiveDraft = () => ({
            ok: false,
            error: 'Память устройства переполнена (тест ошибки).',
          });

          flushSyncFn(() => controls.repsPlusBtn!.click()); // 10 -> 11
          await new Promise((r) => setTimeout(r, AUTOSAVE_DEBOUNCE_MS + 80));

          if (!controls.statusText().includes('Ошибка сохранения')) {
            throw new Error(
              `При сбое сохранения ожидался статус «Ошибка сохранения», получено: «${controls.statusText()}»`
            );
          }
          const alertText = container.querySelector('[role="alert"]')?.textContent || '';
          if (!alertText.includes('Память устройства переполнена')) {
            throw new Error(`Ожидалось сообщение об ошибке в alert, получено: «${alertText}»`);
          }

          // Восстанавливаем запись и нажимаем на кнопку повтора «Ошибка сохранения»
          StorageService.saveActiveDraft = origSaveDraft;
          const retryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            (b.textContent || '').includes('Ошибка сохранения')
          ) as HTMLButtonElement | undefined;
          if (!retryBtn) {
            throw new Error('Кнопка повтора «Ошибка сохранения» не найдена');
          }
          flushSyncFn(() => retryBtn.click());

          if (controls.statusText() !== 'Сохранено') {
            throw new Error(
              `После успешного повтора ожидался статус «Сохранено», получено: «${controls.statusText()}»`
            );
          }
          if (StorageService.getActiveDraft()?.exercises?.[0]?.sets?.[0]?.reps !== 11) {
            throw new Error('После повторного сохранения актуальное значение reps=11 должно записаться');
          }

          return 'Ошибка сохранения корректно отображена и восстановлена в «Сохранено»';
        } finally {
          StorageService.saveActiveDraft = origSaveDraft;
          try {
            flushSyncFn(() => root.unmount());
          } catch {
            // ignore
          }
          await new Promise((r) => setTimeout(r, 30));
          ctx.cleanup();
        }
      }
    );

    // 5. Защита от гонок: новая правка во время записи ревизии 1 не позволяет статусу 1 затереть «Сохранение…»
    await runScenario(
      'Гонка записи: правка во время сохранения более старой ревизии не приводит к ложному статусу «Сохранено» и потере нового значения',
      async () => {
        const ctx = setupReactDomTestEnv();
        const container = ctx.dom.window.document.getElementById('root')!;
        const root = createRootFn(container);
        const origSaveDraft = StorageService.saveActiveDraft.bind(StorageService);

        try {
          ctx.store.set('form_schema_version_v1', '11');
          StorageService.updateProfile({ age: 30, weightKg: 80 });
          const session = createTestSession();

          flushSyncFn(() => {
            root.render(
              React.createElement(ActiveWorkoutModal, {
                session,
                onSave: () => ({ ok: true, error: null }),
                onCancel: () => {},
              })
            );
          });
          await new Promise((r) => setTimeout(r, 25));

          const controls = getControls(ctx.dom.window.document, container);
          const raceState = { interceptedFirstWrite: false };
          const savedSnapshots: Array<{ weightKg: number; reps: number }> = [];

          StorageService.saveActiveDraft = (draft: any) => {
            const set0 = draft?.exercises?.[0]?.sets?.[0];
            savedSnapshots.push({ weightKg: set0?.weightKg, reps: set0?.reps });
            if (!raceState.interceptedFirstWrite) {
              raceState.interceptedFirstWrite = true;
              // Имитируем поступление более свежей правки пока завершается запись ревизии 1
              controls.repsPlusBtn!.click(); // 10 -> 11 (rev 2)
            }
            return origSaveDraft(draft);
          };

          flushSyncFn(() => controls.weightPlusBtn!.click()); // 80 -> 82.5 (rev 1)

          // Ждём срабатывания таймера ревизии 1, но до срабатывания таймера ревизии 2
          await new Promise((r) => setTimeout(r, AUTOSAVE_DEBOUNCE_MS + 60));

          if (!raceState.interceptedFirstWrite) {
            throw new Error('Ожидалась запись ревизии 1');
          }
          if (!controls.statusText().includes('Сохранение…')) {
            throw new Error(
              `Пока ревизия 2 не сохранена, старая запись не имеет права ставить «Сохранено» (получено: «${controls.statusText()}»)`
            );
          }

          // Ждём завершения debounce ревизии 2
          await new Promise((r) => setTimeout(r, AUTOSAVE_DEBOUNCE_MS + 80));

          if (controls.statusText() !== 'Сохранено') {
            throw new Error(
              `После записи ревизии 2 ожидался статус «Сохранено», получено: «${controls.statusText()}»`
            );
          }

          const finalSet = StorageService.getActiveDraft()?.exercises?.[0]?.sets?.[0];
          if (!finalSet || finalSet.weightKg !== 82.5 || finalSet.reps !== 11) {
            throw new Error(
              `Финальный черновик должен содержать оба обновления (82.5 кг × 11), получено: ${JSON.stringify(finalSet)}`
            );
          }

          return `Перехвачена гонка rev1->rev2: финально сохранено ${finalSet.weightKg} кг × ${finalSet.reps}`;
        } finally {
          StorageService.saveActiveDraft = origSaveDraft;
          try {
            flushSyncFn(() => root.unmount());
          } catch {
            // ignore
          }
          await new Promise((r) => setTimeout(r, 30));
          ctx.cleanup();
        }
      }
    );
  } finally {
    if (prevSkipAnimations !== undefined) {
      const { MotionGlobalConfig } = await import('framer-motion');
      MotionGlobalConfig.skipAnimations = prevSkipAnimations;
    }
    console.error = originalConsoleError;
  }

  return results;
}

export async function runWorkoutsTabUxTests(): Promise<TestCaseResult[]> {
  const group = 'WorkoutsTab UX';
  const results: TestCaseResult[] = [];

  const originalConsoleError = console.error;
  let prevSkipAnimations: boolean | undefined;

  try {
    console.error = () => {};
    const envInit = setupReactDomTestEnv();
    let WorkoutsTab: any;
    let createRootFn: any;
    let flushSyncFn: any;

    try {
      const [{ createRoot, flushSync }, fm, mod] = await Promise.all([
        getReactDomHelpers(),
        import('framer-motion'),
        import('../../components/WorkoutsTab'),
      ]);
      createRootFn = createRoot;
      flushSyncFn = flushSync;
      prevSkipAnimations = fm.MotionGlobalConfig.skipAnimations;
      fm.MotionGlobalConfig.skipAnimations = true;
      WorkoutsTab = mod.WorkoutsTab;
    } finally {
      await new Promise((r) => setTimeout(r, 20));
      envInit.cleanup();
    }

    const noop = () => {};
    const makeProgram = (id: string, name: string, status: 'active' | 'paused' | 'archived' | 'completed') => ({
      id,
      name,
      description: 'Тестовая программа',
      goal: 'Сила',
      daysPerWeek: 3,
      status,
      direction: 'programs' as const,
      createdAt: '2026-11-01',
      workouts: [
        {
          id: `${id}_day_1`,
          dayName: 'День 1: Грудь и спина',
          targetMuscleGroups: ['chest', 'lats'] as any,
          estimatedDuration: 45,
          exercises: [
            {
              exerciseId: 'barbell_bench_press_flat',
              name: 'Жим штанги лёжа',
              targetMuscle: 'chest' as const,
              isBodyweight: false,
              sets: 4,
              reps: 8,
              targetWeight: 80,
              restSeconds: 90,
            },
          ],
        },
      ],
    });

    const runScenario = async (name: string, fn: () => Promise<string>) => {
      try {
        const details = await fn();
        results.push({ group, name, passed: true, details });
      } catch (err: any) {
        results.push({
          group,
          name,
          passed: false,
          details: err?.message || String(err),
        });
      }
    };

    // 1. При наличии активной программы вкладка «Программы» сразу открывает «Мои программы» с расписанием и без дублирующих CTA
    await runScenario(
      'Активная программа сразу открывает «Мои программы» с расписанием и единым основным CTA',
      async () => {
        const ctx = setupReactDomTestEnv();
        const container = ctx.dom.window.document.getElementById('root')!;
        const root = createRootFn(container);

        try {
          ctx.store.set('form_schema_version_v1', '11');
          StorageService.updateProfile({ age: 30, weightKg: 80 });
          const activeProg = makeProgram('prog_active_1', 'Силовой базовый цикл', 'active');

          flushSyncFn(() => {
            root.render(
              React.createElement(WorkoutsTab, {
                programs: [activeProg],
                sessions: [],
                onStartProgramWorkout: noop,
                onStartCustomQuickWorkout: noop,
                onCreateProgram: noop,
                onGenerateProgram: noop,
                onEditProgram: noop,
                onDuplicateProgram: noop,
                onDeleteProgram: noop,
                onDeleteSession: noop,
              })
            );
          });
          await new Promise((r) => setTimeout(r, 20));

          const text = container.textContent || '';
          if (text.includes('Два вектора подготовки')) {
            throw new Error('При наличии активной программы не должен открываться экран выбора направлений');
          }
          if (
            !text.includes('Следующая тренировка') ||
            !text.includes('День 1: Грудь и спина') ||
            !text.includes('Дни тренировок (1)')
          ) {
            throw new Error('При наличии активной программы должно сразу отображаться расписание в «Мои программы»');
          }

          const buttons = Array.from(container.querySelectorAll('button'));
          const overviewBtn = buttons.find((b) => (b.textContent || '').trim() === 'Обзор');
          const startBtn = buttons.find((b) => (b.textContent || '').trim() === 'Начать тренировку');
          if (overviewBtn) {
            throw new Error('Дублирующая кнопка «Обзор» рядом с «Начать» должна быть удалена');
          }
          if (!startBtn) {
            throw new Error('Ожидалась единственная основная кнопка «Начать тренировку»');
          }

          // При переходе на экран выбора направлений («Сменить») остаётся только одна точка возврата и один «Быстрый старт»
          const switchBtn = buttons.find((b) => (b.textContent || '').trim() === 'Сменить');
          if (!switchBtn) {
            throw new Error('Кнопка «Сменить» направление не найдена');
          }
          flushSyncFn(() => switchBtn.click());

          const dirText = container.textContent || '';
          if (!dirText.includes('Два вектора подготовки') || !dirText.includes('К тренировке')) {
            throw new Error('Экран выбора направлений должен показывать единый путь возврата «К тренировке»');
          }
          const dirButtons = Array.from(container.querySelectorAll('button'));
          const quickStartBtns = dirButtons.filter((b) => (b.textContent || '').includes('Быстрый старт'));
          if (quickStartBtns.length !== 1) {
            throw new Error(`На экране ожидалась 1 кнопка «Быстрый старт», найдено: ${quickStartBtns.length}`);
          }
          const dupMyProgramsBtns = dirButtons.filter((b) =>
            (b.textContent || '').includes('Мои программы (1)')
          );
          if (dupMyProgramsBtns.length !== 0) {
            throw new Error('При активном баннере «К тренировке» дублирующая кнопка «Мои программы» должна быть скрыта');
          }

          return 'Экран «Мои программы» с расписанием открыт сразу, дублирующие CTA устранены';
        } finally {
          try {
            flushSyncFn(() => root.unmount());
          } catch {
            // ignore
          }
          await new Promise((r) => setTimeout(r, 20));
          ctx.cleanup();
        }
      }
    );

    // 2. Без активной программы остаётся экран направлений, теги сворачиваются через «Показать ещё»
    await runScenario(
      'Без активной программы открывается экран направлений с «Показать ещё» и без ложных активных баннеров',
      async () => {
        const ctx = setupReactDomTestEnv();
        const container = ctx.dom.window.document.getElementById('root')!;
        const root = createRootFn(container);

        try {
          ctx.store.set('form_schema_version_v1', '11');
          const pausedProg = makeProgram('prog_paused_only', 'Старая пауза', 'paused');

          flushSyncFn(() => {
            root.render(
              React.createElement(WorkoutsTab, {
                programs: [pausedProg],
                sessions: [],
                onStartProgramWorkout: noop,
                onStartCustomQuickWorkout: noop,
                onCreateProgram: noop,
                onGenerateProgram: noop,
                onEditProgram: noop,
                onDuplicateProgram: noop,
                onDeleteProgram: noop,
                onDeleteSession: noop,
              })
            );
          });
          await new Promise((r) => setTimeout(r, 20));

          const text = container.textContent || '';
          if (!text.includes('Два вектора подготовки')) {
            throw new Error('При отсутствии активной программы должен сохраняться экран выбора направлений');
          }
          if (text.includes('Текущая программа')) {
            throw new Error('При отсутствии активных программ не должно показываться «Текущая программа» для paused');
          }
          if (text.includes('Общая физическая подготовка') || text.includes('Общая мобильность')) {
            throw new Error('Второстепенные теги направлений должны быть скрыты по умолчанию');
          }

          const showMoreBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
            (b.textContent || '').includes('Показать ещё')
          );
          if (showMoreBtns.length !== 2) {
            throw new Error(`Ожидались 2 кнопки «Показать ещё», найдено: ${showMoreBtns.length}`);
          }

          // Клик по «Показать ещё» раскрывает теги и не перебрасывает в каталог
          flushSyncFn(() => showMoreBtns[0].click());
          const afterExpandText = container.textContent || '';
          if (!afterExpandText.includes('Общая физическая подготовка')) {
            throw new Error('После нажатия «Показать ещё» должны появиться скрытые теги');
          }
          if (!afterExpandText.includes('Два вектора подготовки')) {
            throw new Error('Клик по «Показать ещё» не должен открывать каталог направления');
          }

          return 'Экран направлений сохранён; теги раскрываются по «Показать ещё» без перехода';
        } finally {
          try {
            flushSyncFn(() => root.unmount());
          } catch {
            // ignore
          }
          await new Promise((r) => setTimeout(r, 20));
          ctx.cleanup();
        }
      }
    );

    // 3. Пустой фильтр программ: при пустом filteredPrograms программа из общего списка не подставляется
    await runScenario(
      'Пустой фильтр статуса («Архив (0)») не выбирает программу из общего списка и корректно показывает пустое состояние',
      async () => {
        const ctx = setupReactDomTestEnv();
        const container = ctx.dom.window.document.getElementById('root')!;
        const root = createRootFn(container);

        try {
          ctx.store.set('form_schema_version_v1', '11');
          const activeProg = makeProgram('prog_filter_1', 'Единственная активная', 'active');

          flushSyncFn(() => {
            root.render(
              React.createElement(WorkoutsTab, {
                programs: [activeProg],
                sessions: [],
                onStartProgramWorkout: noop,
                onStartCustomQuickWorkout: noop,
                onCreateProgram: noop,
                onGenerateProgram: noop,
                onEditProgram: noop,
                onDuplicateProgram: noop,
                onDeleteProgram: noop,
                onDeleteSession: noop,
              })
            );
          });
          await new Promise((r) => setTimeout(r, 20));

          const archiveFilterBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            (b.textContent || '').includes('Архив')
          );
          if (!archiveFilterBtn) {
            throw new Error('Кнопка фильтра «Архив» не найдена');
          }

          flushSyncFn(() => archiveFilterBtn.click());

          const textAfterFilter = container.textContent || '';
          if (!textAfterFilter.includes('Нет программ со статусом «В архиве»')) {
            throw new Error('При пустом фильтре должно отображаться сообщение пустого состояния');
          }
          const manageBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            (b.textContent || '').trim() === 'Управление'
          );
          if (manageBtn || textAfterFilter.includes('Дни тренировок (1)')) {
            throw new Error('При пустом filteredPrograms не должна отображаться выбранная программа из общего списка');
          }

          // Проверяем, что направление в верхнем переключателе не упало и возврат фильтра работает
          const resetFilterBtn = Array.from(container.querySelectorAll('button')).find((b) =>
            (b.textContent || '').includes('Показать все (1)')
          );
          if (!resetFilterBtn) {
            throw new Error('Кнопка «Показать все (1)» не найдена');
          }
          flushSyncFn(() => resetFilterBtn.click());

          const restoredText = container.textContent || '';
          if (!restoredText.includes('Дни тренировок (1)') || !restoredText.includes('Единственная активная')) {
            throw new Error('После сброса фильтра программа из списка должна восстановиться');
          }

          return 'Пустой фильтр скрывает карточку программы и восстанавливает выбор при «Показать все»';
        } finally {
          try {
            flushSyncFn(() => root.unmount());
          } catch {
            // ignore
          }
          await new Promise((r) => setTimeout(r, 20));
          ctx.cleanup();
        }
      }
    );
  } finally {
    if (prevSkipAnimations !== undefined) {
      const { MotionGlobalConfig } = await import('framer-motion');
      MotionGlobalConfig.skipAnimations = prevSkipAnimations;
    }
    console.error = originalConsoleError;
  }

  return results;
}



