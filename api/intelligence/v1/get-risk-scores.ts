export const config = { runtime: 'edge' };

import { createDomainGateway, serverOptions } from '../../../server/gateway';
import { createIntelligenceServiceRoutes } from '../../../src/generated/server/worldmonitor/intelligence/v1/service_server';
import { intelligenceHandler } from '../../../server/worldmonitor/intelligence/v1/handler';

const routes = createIntelligenceServiceRoutes(intelligenceHandler, serverOptions)
  .filter((route) => route.path === '/api/intelligence/v1/get-risk-scores');

if (routes.length !== 1) {
  throw new Error('Exact route wiring failed for /api/intelligence/v1/get-risk-scores');
}

export default createDomainGateway(routes);
