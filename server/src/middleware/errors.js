export class HttpError extends Error {
  constructor(status, message, code = 'error', details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: 'Resource not found.' } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  if (err?.name === 'ZodError') {
    const fields = {};
    for (const issue of err.issues) fields[issue.path.join('.') || '_'] = issue.message;
    return res.status(400).json({
      error: { code: 'validation_failed', message: 'Please check the highlighted fields.', details: { fields } },
    });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'bad_json', message: 'Malformed JSON body.' } });
  }
  if (err?.code === '23505') {
    return res.status(409).json({ error: { code: 'conflict', message: 'That record already exists.' } });
  }
  if (err?.code === '23503') {
    return res.status(400).json({ error: { code: 'invalid_reference', message: 'Referenced record does not exist.' } });
  }
  console.error('[api] unhandled error:', err);
  return res.status(500).json({ error: { code: 'server_error', message: 'Something went wrong. Please try again.' } });
}
