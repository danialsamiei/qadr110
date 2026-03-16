export const config = { runtime: 'edge' };

import { createDomainGateway } from '../../../server/gateway';
import type { RouteDescriptor } from '../../../server/router';
import type { AssistantRunRequest } from '../../../src/platform/ai/assistant-contracts';
import { runIntelligenceAssistant } from '../../../server/worldmonitor/intelligence/v1/assistant';

const routes: RouteDescriptor[] = [
  {
    method: 'POST',
    path: '/api/intelligence/v1/assistant',
    handler: async (req: Request): Promise<Response> => {
      try {
        const body = await req.json() as AssistantRunRequest;
        const result = await runIntelligenceAssistant(body);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Assistant request failed.';
        const status = /required/i.test(message) ? 400 : 500;
        return new Response(JSON.stringify({ message }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    },
  },
];

export default createDomainGateway(routes);
