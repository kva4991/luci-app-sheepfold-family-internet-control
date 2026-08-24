#!/usr/bin/env node

/**
 * Сверяет двусторонний manifest публичного Sheepfold и закрытого server project
 *
 * Входы: --peer <путь к sheepfold-support-server>
 * Выход: JSON с contract ID и protocol major
 * Причина формы: private submodule запрещён, а агенту нужна проверяемая связь из любого репозитория
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function peerPathFromArgs(args) {
  const peerIndex = args.indexOf('--peer');
  if (peerIndex < 0 || !args[peerIndex + 1]) {
    throw new Error('Usage: node tools/remoteSupport/checkPeerContract.mjs --peer <path-to-support-server>');
  }
  return path.resolve(args[peerIndex + 1]);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export async function checkPeerContract(peerDir) {
  const local = await readJson(path.join(scriptDir, 'peer-project.json'));
  const remote = await readJson(path.join(peerDir, 'contracts', 'peer-project.json'));

  assert(local.contractId === remote.contractId, 'Peer contract IDs differ');
  assert(local.protocol.name === remote.protocol.name, 'Protocol names differ');
  assert(local.protocol.major === remote.protocol.major, 'Protocol major versions differ');
  assert(local.thisProject.repository === remote.peerProject.repository, 'Client repository URLs differ');
  assert(local.peerProject.repository === remote.thisProject.repository, 'Server repository URLs differ');
  assert(local.protocol.canonicalRepository === remote.protocol.canonicalRepository, 'Canonical protocol owner differs');

  return {
    status: 'ok',
    contractId: local.contractId,
    protocolMajor: local.protocol.major,
    peer: remote.thisProject.name,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const peerDir = peerPathFromArgs(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(await checkPeerContract(peerDir))}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: 'error', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
