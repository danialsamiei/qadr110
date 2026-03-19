import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QADR_PUBLIC_ORIGIN,
  getCookieDomainForHostname,
  getHostAwareOriginFromLocation,
  isKnownQadrAppHostname,
} from '@/utils/host-routing';

test('recognizes both public and national web hosts', () => {
  assert.equal(isKnownQadrAppHostname('qadr.alefba.dev'), true);
  assert.equal(isKnownQadrAppHostname('qadr.gantor.ir'), true);
  assert.equal(isKnownQadrAppHostname('5.235.208.128'), true);
  assert.equal(isKnownQadrAppHostname('evil.example.com'), false);
});

test('derives host-aware origin from current browser location', () => {
  assert.equal(
    getHostAwareOriginFromLocation({
      protocol: 'https:',
      host: 'qadr.alefba.dev',
      origin: 'https://qadr.alefba.dev',
    }),
    'https://qadr.alefba.dev',
  );

  assert.equal(
    getHostAwareOriginFromLocation({
      protocol: 'http:',
      host: 'qadr.gantor.ir',
      origin: 'http://qadr.gantor.ir',
    }),
    'http://qadr.gantor.ir',
  );
});

test('falls back to the public origin when no valid host context exists', () => {
  assert.equal(getHostAwareOriginFromLocation(null), QADR_PUBLIC_ORIGIN);
  assert.equal(getHostAwareOriginFromLocation({ hostname: 'unknown.example.com' }), QADR_PUBLIC_ORIGIN);
});

test('maps cookie domains only for supported registrable domains', () => {
  assert.equal(getCookieDomainForHostname('qadr.alefba.dev'), '.qadr.alefba.dev');
  assert.equal(getCookieDomainForHostname('qadr.gantor.ir'), '.qadr.gantor.ir');
  assert.equal(getCookieDomainForHostname('5.235.208.128'), null);
});
