/**
 * OpenAPI Specification
 * Documents all API endpoints for the Marketing Agent
 */

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Marketing Agent API',
    version: '1.0.0',
    description: 'API for hotel prospect management and automated email campaigns',
  },
  servers: [
    { url: '/api', description: 'API routes' },
  ],
  paths: {
    '/prospects': {
      get: {
        summary: 'List prospects',
        tags: ['Prospects'],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          { name: 'tier', in: 'query', schema: { type: 'string', enum: ['hot', 'warm', 'cold'] } },
          { name: 'stage', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'List of prospects',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ProspectListResponse' },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create a prospect',
        tags: ['Prospects'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateProspectRequest' },
            },
          },
        },
        responses: {
          201: { description: 'Prospect created' },
          400: { description: 'Invalid input' },
        },
      },
    },
    '/campaigns': {
      get: {
        summary: 'List campaigns with stats',
        tags: ['Campaigns'],
        responses: {
          200: {
            description: 'List of campaigns with performance stats',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CampaignListResponse' },
              },
            },
          },
        },
      },
      post: {
        summary: 'Create a campaign',
        tags: ['Campaigns'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateCampaignRequest' },
            },
          },
        },
        responses: {
          201: { description: 'Campaign created' },
          400: { description: 'Invalid input' },
        },
      },
    },
    '/emails': {
      get: {
        summary: 'List emails',
        tags: ['Emails'],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: {
          200: { description: 'List of emails' },
        },
      },
    },
    '/auto-email': {
      get: {
        summary: 'Get auto-email status',
        tags: ['Auto Email'],
        responses: {
          200: { description: 'Auto-email configuration and eligible prospect counts' },
        },
      },
      post: {
        summary: 'Trigger auto-email batch',
        tags: ['Auto Email'],
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AutoEmailRequest' },
            },
          },
        },
        responses: {
          200: { description: 'Auto-email results' },
        },
      },
    },
    '/stats': {
      get: {
        summary: 'Get dashboard statistics',
        tags: ['Stats'],
        responses: {
          200: {
            description: 'Dashboard statistics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/StatsResponse' },
              },
            },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Authenticate',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['password'],
                properties: {
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Login successful' },
          401: { description: 'Invalid password' },
          429: { description: 'Too many attempts' },
        },
      },
    },
  },
  components: {
    schemas: {
      Prospect: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email', nullable: true },
          city: { type: 'string', nullable: true },
          country: { type: 'string', nullable: true },
          property_type: { type: 'string', enum: ['hotel', 'resort', 'restaurant', 'spa', 'cruise'] },
          tier: { type: 'string', enum: ['hot', 'warm', 'cold'] },
          stage: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 100 },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      CreateProspectRequest: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' },
          city: { type: 'string' },
          country: { type: 'string' },
          property_type: { type: 'string' },
          website: { type: 'string', format: 'uri' },
        },
      },
      ProspectListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              prospects: { type: 'array', items: { $ref: '#/components/schemas/Prospect' } },
              total: { type: 'integer' },
            },
          },
        },
      },
      Campaign: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string' },
          strategy_key: { type: 'string' },
          active: { type: 'boolean' },
          daily_limit: { type: 'integer' },
          emails_sent: { type: 'integer' },
          emails_today: { type: 'integer' },
          reply_rate: { type: 'number' },
          meeting_rate: { type: 'number' },
        },
      },
      CreateCampaignRequest: {
        type: 'object',
        required: ['name', 'strategy_key'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          strategy_key: { type: 'string' },
          daily_limit: { type: 'integer', default: 20 },
        },
      },
      CampaignListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              campaigns: { type: 'array', items: { $ref: '#/components/schemas/Campaign' } },
              summary: { type: 'object' },
              available_strategies: { type: 'array' },
            },
          },
        },
      },
      AutoEmailRequest: {
        type: 'object',
        properties: {
          max_emails: { type: 'integer', default: 10, maximum: 100 },
          min_score: { type: 'integer', default: 50 },
          stagger_delay: { type: 'boolean', default: false },
        },
      },
      StatsResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              total: { type: 'integer' },
              byTier: { type: 'object' },
              byStage: { type: 'object' },
              painLeads: { type: 'integer' },
              painSignals: { type: 'integer' },
            },
          },
        },
      },
      ApiError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', enum: [false] },
          error: { type: 'string' },
          errorId: { type: 'string' },
        },
      },
    },
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'auth_token',
      },
    },
  },
  security: [{ cookieAuth: [] }],
};

export default openApiSpec;
