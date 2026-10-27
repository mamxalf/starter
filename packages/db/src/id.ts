import { uuidv7 } from 'uuidv7'

/** Time-ordered UUID (v7): index-friendly and safe to expose in URLs. */
export const newId = (): string => uuidv7()
