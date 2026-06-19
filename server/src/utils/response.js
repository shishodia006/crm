export function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function ok(res, data = null, message = 'OK') {
  res.json({ success: true, message, data });
}

export function fail(res, message, code = 400, errors = null) {
  res.status(code).json({ success: false, message, errors });
}
