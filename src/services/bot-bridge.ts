export interface BotBridgeConfig {
  telegramWebhookUrl?: string;
  baleWebhookUrl?: string;
}

export interface BotMessage {
  title: string;
  body: string;
  severity?: 'info' | 'warning' | 'critical';
  tags?: string[];
}

async function postJson(url: string, payload: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Bot webhook failed (${res.status})`);
  }
}

export async function sendBotAlert(config: BotBridgeConfig, message: BotMessage): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (config.telegramWebhookUrl) {
    tasks.push(postJson(config.telegramWebhookUrl, { platform: 'telegram', ...message }));
  }
  if (config.baleWebhookUrl) {
    tasks.push(postJson(config.baleWebhookUrl, { platform: 'bale', ...message }));
  }
  await Promise.all(tasks);
}
