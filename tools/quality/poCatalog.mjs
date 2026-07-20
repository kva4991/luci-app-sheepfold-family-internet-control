/*
 * Разбирает используемое Sheepfold подмножество gettext PO без внешних программ.
 * Нужен quality gate: клиентский JSON обязан воспроизводиться из PO и не должен
 * терять строки из-за экранированных кавычек, fuzzy-записей или регистра. §qassist
 */

function decodePoLiteral(raw) {
  const value = JSON.parse(raw);
  if (typeof value !== 'string') {
    throw new TypeError(`PO literal is not a string: ${raw}`);
  }
  return value;
}

export function parsePoEntries(source) {
  const entries = new Map();
  let msgidParts = [];
  let msgstrParts = [];
  let activeField = null;
  let fuzzy = false;

  function flush() {
    const msgid = msgidParts.join('');
    const msgstr = msgstrParts.join('');
    if (msgid && msgstr && !fuzzy) {
      if (entries.has(msgid) && entries.get(msgid) !== msgstr) {
        throw new Error(`Conflicting translations for exact msgid: ${msgid}`);
      }
      entries.set(msgid, msgstr);
    }
    msgidParts = [];
    msgstrParts = [];
    activeField = null;
    fuzzy = false;
  }

  for (const sourceLine of String(source).split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line) {
      flush();
    } else if (line.startsWith('#,')) {
      fuzzy ||= line.slice(2).split(',').some((flag) => flag.trim() === 'fuzzy');
    } else if (line.startsWith('#')) {
      continue;
    } else if (line.startsWith('msgid ')) {
      if (msgidParts.length || msgstrParts.length) flush();
      activeField = 'msgid';
      msgidParts.push(decodePoLiteral(line.slice(6).trim()));
    } else if (line.startsWith('msgstr ')) {
      activeField = 'msgstr';
      msgstrParts.push(decodePoLiteral(line.slice(7).trim()));
    } else if (line.startsWith('msgid_plural ') || line.startsWith('msgstr[')) {
      activeField = null;
    } else if (line.startsWith('"')) {
      if (activeField === 'msgid') msgidParts.push(decodePoLiteral(line));
      if (activeField === 'msgstr') msgstrParts.push(decodePoLiteral(line));
    }
  }
  flush();
  return entries;
}

export function poEntriesObject(source) {
  return Object.fromEntries(parsePoEntries(source));
}
