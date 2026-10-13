/** One CORS policy for the production API and its HTTP acceptance fixtures. */
export function apiCorsOptions(origin: string | undefined) {
  return { origin, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }
}
