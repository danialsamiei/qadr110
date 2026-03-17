import test from 'node:test';
import assert from 'node:assert/strict';

import { parseRssItems } from './_rss-parser.js';

test('parseRssItems extracts RSS items without DOMParser', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0">
    <channel>
      <item>
        <title><![CDATA[Internet outage in Tehran]]></title>
        <pubDate>Tue, 17 Mar 2026 10:00:00 GMT</pubDate>
        <link>https://example.com/1</link>
        <description><![CDATA[<p>Traffic disruption</p>]]></description>
      </item>
      <item>
        <title>Search spike for Hormuz</title>
        <pubDate>Tue, 17 Mar 2026 11:00:00 GMT</pubDate>
        <link>https://example.com/2</link>
      </item>
    </channel>
  </rss>`;

  const items = parseRssItems(xml);

  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    title: 'Internet outage in Tehran',
    pubDate: 'Tue, 17 Mar 2026 10:00:00 GMT',
    link: 'https://example.com/1',
    description: 'Traffic disruption',
  });
  assert.equal(items[1]?.title, 'Search spike for Hormuz');
});

test('parseRssItems enforces optional limit', () => {
  const xml = `<rss><channel>
    <item><title>one</title></item>
    <item><title>two</title></item>
    <item><title>three</title></item>
  </channel></rss>`;

  const items = parseRssItems(xml, 2);
  assert.deepEqual(items.map((item) => item.title), ['one', 'two']);
});
