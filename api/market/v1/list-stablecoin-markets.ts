export const config = { runtime: 'edge' };

import { createDomainGateway, serverOptions } from '../../../server/gateway';
import { createMarketServiceRoutes } from '../../../src/generated/server/worldmonitor/market/v1/service_server';
import { marketHandler } from '../../../server/worldmonitor/market/v1/handler';

const routes = createMarketServiceRoutes(marketHandler, serverOptions)
  .filter((route) => route.path === '/api/market/v1/list-stablecoin-markets');

if (routes.length !== 1) {
  throw new Error('Exact route wiring failed for /api/market/v1/list-stablecoin-markets');
}

export default createDomainGateway(routes);
