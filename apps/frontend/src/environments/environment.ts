// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  // Backend Spring Boot URL
  baseUrl: 'http://localhost:8080/api',
  websocket: {
    enabled: true,
    url: 'ws://localhost:8080/api/ws-native', // URL del backend Spring Boot (WebSocket nativo)
    fallbackUrl: 'ws://localhost:8080/api/ws', // URL con SockJS fallback
    // Configuración de reconexión
    maxReconnectAttempts: 5,
    reconnectInterval: 3000,
    heartbeatInterval: 30000,
    // Timeout para obtener token JWT
    authTimeout: 10000
  },
  maps: {
    googleMapsApiKey: 'AIzaSyCpagJ3zXZf0mUP6VZV_1yhiYb_qQ0uCao'
  }
}
/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
