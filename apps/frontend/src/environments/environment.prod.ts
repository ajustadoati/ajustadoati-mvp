export const environment = {
  production: true,
  baseUrl: '/api',
  websocket: {
    enabled: true,
    url: '/api/ws-native',
    fallbackUrl: '/api/ws',
    maxReconnectAttempts: 5,
    reconnectInterval: 3000,
    heartbeatInterval: 30000,
    authTimeout: 10000
  },
  maps: {
    googleMapsApiKey: 'YOUR_PRODUCTION_GOOGLE_MAPS_API_KEY'
  }
};
