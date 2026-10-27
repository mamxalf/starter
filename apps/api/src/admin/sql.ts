/** Escapes LIKE/ILIKE wildcards so user input is matched literally (Postgres' default escape is `\`). */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`)

export const pageOffset = (input: { page: number; pageSize: number }) => ({
  limit: input.pageSize,
  offset: (input.page - 1) * input.pageSize,
})
