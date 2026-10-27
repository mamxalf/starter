import { tenantRead, tenantWrite } from '../../orpc'
import * as service from './files.service'

export const filesRouter = {
  createUpload: tenantWrite.files.createUpload.handler(({ context, input }) =>
    service.createUpload(context.deps, context, context.user, input),
  ),
  completeUpload: tenantWrite.files.completeUpload.handler(({ context, input }) =>
    service.completeUpload(context.deps, context, input.fileId),
  ),
  downloadUrl: tenantRead.files.downloadUrl.handler(({ context, input }) =>
    service.downloadUrl(context.deps, context, input.fileId),
  ),
}
