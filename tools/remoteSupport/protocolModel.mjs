// Стабильный фасад reference-контракта; внутренние области разделены по ответственности.
export {
  ProtocolError,
  accessLifeSec,
  claimLifeSec,
  maxMessageBytes,
  maxMessageLifeSec,
  maxSafeSequence,
  messageTypes,
  protocolVersion,
  sessionStates,
} from './protocolValues.mjs';

export { parseStrictJson } from './strictJson.mjs';

export {
  ReplayWindow,
  buildSignInput,
  createEnvelope,
  validateEnvelope,
  validatePayload,
  verifyEnvelope,
} from './signedEnvelope.mjs';

export {
  advanceState,
  createAccessDeadline,
  createClaimDeadline,
  generateClaimCode,
  preserveDeadline,
} from './sessionState.mjs';
