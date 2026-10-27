/** Human message from an oRPC error (CONFLICT, BAD_REQUEST, ...). */
export const rpcErrorMessage = (error: unknown) =>
  error instanceof Error && error.message ? error.message : 'Something went wrong'
