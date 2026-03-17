export const config = { runtime: 'edge' };

import { createDomainGateway, serverOptions } from '../../../server/gateway';
import { createInfrastructureServiceRoutes } from '../../../src/generated/server/worldmonitor/infrastructure/v1/service_server';
import { infrastructureHandler } from '../../../server/worldmonitor/infrastructure/v1/handler';

const routes = createInfrastructureServiceRoutes(infrastructureHandler, serverOptions)
  .filter((route) => route.path === '/api/infrastructure/v1/list-temporal-anomalies');

if (routes.length !== 1) {
  throw new Error('Exact route wiring failed for /api/infrastructure/v1/list-temporal-anomalies');
}

export default createDomainGateway(routes);
