export const config = { runtime: 'edge' };

import { createDomainGateway, serverOptions } from '../../../server/gateway';
import { createSupplyChainServiceRoutes } from '../../../src/generated/server/worldmonitor/supply_chain/v1/service_server';
import { supplyChainHandler } from '../../../server/worldmonitor/supply-chain/v1/handler';

const routes = createSupplyChainServiceRoutes(supplyChainHandler, serverOptions)
  .filter((route) => route.path === '/api/supply-chain/v1/get-shipping-rates');

if (routes.length !== 1) {
  throw new Error('Exact route wiring failed for /api/supply-chain/v1/get-shipping-rates');
}

export default createDomainGateway(routes);
