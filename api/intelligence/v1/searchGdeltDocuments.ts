export const config = { runtime: 'edge' };

import { createDomainGateway } from '../../../server/gateway';
import type { RouteDescriptor } from '../../../server/router';
import { searchGdeltDocuments } from '../../../server/worldmonitor/intelligence/v1/search-gdelt-documents';
import type { SearchGdeltDocumentsRequest } from '../../../src/generated/server/worldmonitor/intelligence/v1/service_server';

const routes: RouteDescriptor[] = [
  {
    method: 'POST',
    path: '/api/intelligence/v1/searchGdeltDocuments',
    handler: async (req: Request): Promise<Response> => {
      const rawBody = await req.json().catch(() => ({})) as Partial<SearchGdeltDocumentsRequest> & {
        limit?: number;
      };
      const result = await searchGdeltDocuments(
        {
          request: req,
          pathParams: {},
          headers: Object.fromEntries(req.headers.entries()),
        },
        {
          query: rawBody.query ?? '',
          maxRecords: typeof rawBody.maxRecords === 'number'
            ? rawBody.maxRecords
            : Number.isFinite(rawBody.limit)
              ? Number(rawBody.limit)
              : 0,
          timespan: rawBody.timespan ?? '72h',
          toneFilter: rawBody.toneFilter ?? '',
          sort: rawBody.sort ?? 'date',
        },
      );

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  },
];

export default createDomainGateway(routes);
