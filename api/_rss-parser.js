function decodeXmlEntities(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractTag(block, tagName) {
  const tagPattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = block.match(tagPattern);
  if (!match) return '';
  return stripTags(decodeXmlEntities(match[1] || ''));
}

export function parseRssItems(rawXml, limit = Number.POSITIVE_INFINITY) {
  if (typeof rawXml !== 'string' || !rawXml.trim()) return [];

  const items = [];
  const itemPattern = /<item\b[\s\S]*?<\/item>/gi;
  let match;
  while ((match = itemPattern.exec(rawXml)) !== null) {
    const block = match[0];
    items.push({
      title: extractTag(block, 'title'),
      pubDate: extractTag(block, 'pubDate'),
      link: extractTag(block, 'link'),
      description: extractTag(block, 'description'),
    });
    if (items.length >= limit) break;
  }

  return items.filter((item) => item.title);
}
