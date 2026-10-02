import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeDestination } from '../src/loginDestination.js';
const origin='https://dev-axforwork.wia.co.kr';
test('only internal service return paths are accepted',()=>{
 for(const value of ['/wianews/agent','/wiacoding/agent?query=%ED%95%9C#part','/wianews/'])assert.equal(safeDestination(value,origin),value);
 for(const value of ['https://evil.example','//evil.example','/\\evil.example','/wianews/../../login','/wianews/%2f%2fevil.example','/login','/api/auth/logout'])assert.equal(safeDestination(value,origin),'/');
});
