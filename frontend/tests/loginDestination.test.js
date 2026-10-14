import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeDestination } from '../src/loginDestination.js';
const origin='https://dev-axforwork.wia.co.kr';
test('only internal service return paths are accepted',()=>{
 for(const value of ['/wianews/agent','/wiacoding/agent?query=%ED%95%9C#part','/wianews/'])assert.equal(safeDestination(value,origin),value);
 for(const value of ['https://evil.example','//evil.example','/\\evil.example','/wianews/../../login','/wianews/%2f%2fevil.example','/login','/api/auth/logout'])assert.equal(safeDestination(value,origin),'/');
});

// WiaMeet must return to its requested page after central login.
test('WiaMeet login destination preserves path and query', () => {
  assert.equal(safeDestination('/wiameet/agent?from=login', 'https://axforwork.wia.co.kr'), '/wiameet/agent?from=login');
  assert.equal(safeDestination('/wiameet-evil/agent', 'https://axforwork.wia.co.kr'), '/');
});

test('WiaVoice returns after central login with strict path boundaries', () => {
  for(const value of ['/wiavoice','/wiavoice/','/wiavoice/?from=login'])assert.equal(safeDestination(value,origin),value);
  for(const value of ['/wiavoice-evil/','/wiavoice/../../login','/wiavoice/%2f%2fevil.example'])assert.equal(safeDestination(value,origin),'/');
});

// WiaReport returns to its application after unified login.
test('WiaReport returns after central login with strict path boundaries', () => {
  assert.equal(safeDestination('/wiareport/agent?guide=1', origin), '/wiareport/agent?guide=1');
  for (const value of ['/wiareport-evil/agent', '/wiareport/../../login']) assert.equal(safeDestination(value, origin), '/');
});
