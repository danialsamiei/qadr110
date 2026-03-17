export const config = { runtime: 'edge' };

import { createDomainGateway, serverOptions } from '../../../server/gateway';
import { createEconomicServiceRoutes } from '../../../src/generated/server/worldmonitor/economic/v1/service_server';
import { economicHandler } from '../../../server/worldmonitor/economic/v1/handler';

const routes = createEconomicServiceRoutes(economicHandler, serverOptions)
  .filter((route) => route.path === '/api/economic/v1/get-macro-signals');

if (routes.length !== 1) {
  throw new Error('Exact route wiring failed for /api/economic/v1/get-macro-signals');
}

export default createDomainGateway(routes);
