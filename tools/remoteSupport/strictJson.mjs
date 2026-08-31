import { TextDecoder } from 'node:util';

import {
  fail,
  maxMessageBytes,
} from './protocolValues.mjs';

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function hasInvalidSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true;
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function scanJson(text) {
  let offset = 0;

  const jsonFail = (detail) => fail('messageMalformed', `invalid JSON at ${offset}: ${detail}`);
  const skipSpace = () => {
    while (offset < text.length && [' ', '\t', '\n', '\r'].includes(text[offset])) {
      offset += 1;
    }
  };

  const readString = () => {
    if (text[offset] !== '"') {
      jsonFail('string expected');
    }
    const start = offset;
    offset += 1;
    while (offset < text.length) {
      const char = text[offset];
      if (char === '"') {
        offset += 1;
        try {
          const value = JSON.parse(text.slice(start, offset));
          if (value.includes('\u0000')) {
            jsonFail('NUL is forbidden');
          }
          if (hasInvalidSurrogate(value)) {
            jsonFail('unpaired unicode surrogate');
          }
          return value;
        } catch {
          jsonFail('invalid string escape');
        }
      }
      if (char.charCodeAt(0) < 0x20) {
        jsonFail('unescaped control character');
      }
      if (char === '\\') {
        offset += 1;
        const escaped = text[offset];
        if (escaped === 'u') {
          const hex = text.slice(offset + 1, offset + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            jsonFail('invalid unicode escape');
          }
          offset += 5;
          continue;
        }
        if (!['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(escaped)) {
          jsonFail('invalid escape');
        }
      }
      offset += 1;
    }
    jsonFail('unterminated string');
    return '';
  };

  const readNumber = () => {
    const match = text.slice(offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) {
      jsonFail('invalid number');
    }
    offset += match[0].length;
  };

  const readValue = (depth) => {
    if (depth > 16) {
      jsonFail('maximum nesting depth exceeded');
    }
    skipSpace();
    const char = text[offset];
    if (char === '"') {
      readString();
      return;
    }
    if (char === '{') {
      offset += 1;
      skipSpace();
      const keys = new Set();
      let count = 0;
      if (text[offset] === '}') {
        offset += 1;
        return;
      }
      while (offset < text.length) {
        skipSpace();
        const key = readString();
        if (keys.has(key)) {
          jsonFail(`duplicate key ${JSON.stringify(key)}`);
        }
        keys.add(key);
        count += 1;
        if (count > 64) {
          jsonFail('too many object fields');
        }
        skipSpace();
        if (text[offset] !== ':') {
          jsonFail('colon expected');
        }
        offset += 1;
        readValue(depth + 1);
        skipSpace();
        if (text[offset] === '}') {
          offset += 1;
          return;
        }
        if (text[offset] !== ',') {
          jsonFail('comma expected');
        }
        offset += 1;
      }
      jsonFail('unterminated object');
    }
    if (char === '[') {
      offset += 1;
      skipSpace();
      let count = 0;
      if (text[offset] === ']') {
        offset += 1;
        return;
      }
      while (offset < text.length) {
        readValue(depth + 1);
        count += 1;
        if (count > 128) {
          jsonFail('too many array items');
        }
        skipSpace();
        if (text[offset] === ']') {
          offset += 1;
          return;
        }
        if (text[offset] !== ',') {
          jsonFail('comma expected');
        }
        offset += 1;
      }
      jsonFail('unterminated array');
    }
    if (char === '-' || /[0-9]/.test(char || '')) {
      readNumber();
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, offset)) {
        offset += literal.length;
        return;
      }
    }
    jsonFail('value expected');
  };

  readValue(0);
  skipSpace();
  if (offset !== text.length) {
    jsonFail('trailing data');
  }
}

export function parseStrictJson(bytes, limit = maxMessageBytes) {
  const input = Buffer.from(bytes);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 24576 ||
      input.length === 0 || input.length > limit) {
    fail('messageMalformed', 'payload size is outside the allowed range');
  }

  let text;
  try {
    text = utf8Decoder.decode(input);
  } catch {
    fail('messageMalformed', 'payload is not valid UTF-8');
  }
  if (text.includes('\u0000')) {
    fail('messageMalformed', 'NUL is forbidden');
  }

  scanJson(text);
  try {
    return JSON.parse(text);
  } catch {
    fail('messageMalformed', 'payload is not valid JSON');
  }
  return null;
}
