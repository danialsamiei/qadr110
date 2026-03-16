export interface ConjureLikeTypeDefinition {
  name: string;
  fields: Array<{ name: string; type: string; required: boolean }>;
}

export interface ConjureLikeEndpoint {
  name: string;
  httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  requestType?: string;
  responseType: string;
}

export interface ConjureLikeBoundary {
  namespace: string;
  types: ConjureLikeTypeDefinition[];
  endpoints: ConjureLikeEndpoint[];
}

export function buildConjureLikeBoundary(serviceName: string): ConjureLikeBoundary {
  return {
    namespace: `qadr.${serviceName}`.toLowerCase(),
    types: [
      {
        name: 'OntologyObject',
        fields: [
          { name: 'rid', type: 'string', required: true },
          { name: 'objectType', type: 'string', required: true },
          { name: 'label', type: 'string', required: true },
        ],
      },
      {
        name: 'RelationshipEdge',
        fields: [
          { name: 'sourceRid', type: 'string', required: true },
          { name: 'targetRid', type: 'string', required: true },
          { name: 'kind', type: 'string', required: true },
        ],
      },
    ],
    endpoints: [
      {
        name: 'listOntologyObjects',
        httpMethod: 'POST',
        path: `/compat/${serviceName}/ontology/objects`,
        requestType: 'OntologyQuery',
        responseType: 'OntologyObject[]',
      },
      {
        name: 'listRelationshipEdges',
        httpMethod: 'POST',
        path: `/compat/${serviceName}/ontology/relationships`,
        requestType: 'OntologyQuery',
        responseType: 'RelationshipEdge[]',
      },
    ],
  };
}
