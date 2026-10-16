// Real RSA verification with a test signing key; no SMS, Firebase user or network mutation.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import ts from 'typescript';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const file = new URL('../.migration/firebase-verification.mjs', import.meta.url);
mkdirSync(new URL('../.migration/', import.meta.url), { recursive: true });
const source = readFileSync(new URL('../src/lib/firebase-admin.ts', import.meta.url), 'utf8').replace("import 'server-only';", '');
writeFileSync(file, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const realFetch = globalThis.fetch;
try {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const now = Math.floor(Date.now()/1000), project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  let user = { localId: 'verified-user', phoneNumber: '+919876543210', validSince: String(now - 1) }, failLookup = false;
  globalThis.fetch = async url => String(url).includes('/jwk/') ? Response.json({ keys: [publicJwk] }) : failLookup ? Response.json({}, { status: 503 }) : Response.json({ users: [user] });
  const { verifyFirebasePhoneToken } = await import(file.href);
  const claims = { sub: user.localId, aud: project, iss: `https://securetoken.google.com/${project}`, iat: now, exp: now + 3600,
    auth_time: now, phone_number: user.phoneNumber, firebase: { sign_in_provider: 'phone' } };
  const sign = payload => new SignJWT(payload).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(privateKey);
  const valid = await sign(claims);
  assert.equal((await verifyFirebasePhoneToken(valid)).uid, user.localId);
  await assert.rejects(() => verifyFirebasePhoneToken('not-a-token'));
  const chunks = valid.split('.'); chunks[1] = Buffer.from(JSON.stringify({ ...claims, sub: 'forged-user' })).toString('base64url');
  await assert.rejects(() => verifyFirebasePhoneToken(chunks.join('.')));
  for (const change of [{ aud: 'wrong-project' }, { iss: 'wrong-issuer' }, { exp: now - 1 }, { iat: now + 1000 }, { auth_time: now + 1000 }, { firebase: { sign_in_provider: 'password' } }]) {
    const invalid = await sign({ ...claims, ...change }); await assert.rejects(() => verifyFirebasePhoneToken(invalid));
  }
  for (const change of [{ disabled: true }, { validSince: String(now + 1) }, { localId: 'another-user' }, { phoneNumber: '+15551234567' }, { validSince: 'invalid' }]) {
    const before = user; user = { ...before, ...change }; await assert.rejects(() => verifyFirebasePhoneToken(valid)); user = before;
  }
  failLookup = true; await assert.rejects(() => verifyFirebasePhoneToken(valid));
  console.log('Passed: real RSA signatures, tampering rejection, issuer/project/time/provider validation, matching live account, disabled/revoked/mismatched account rejection, and fail-closed API errors. No SMS sent.');
} finally { globalThis.fetch = realFetch; unlinkSync(file); }
