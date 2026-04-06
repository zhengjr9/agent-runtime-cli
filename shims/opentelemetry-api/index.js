class NoopSpan {
  constructor() {
    this._context = { spanId: '' }
  }

  spanContext() {
    return this._context
  }

  setAttribute() {}
  setAttributes() {}
  addEvent() {}
  recordException() {}
  setStatus() {}
  end() {}
}

class NoopTracer {
  startSpan() {
    return new NoopSpan()
  }
}

let activeSpan = null
let tracerProvider = null

export const DiagLogLevel = {
  ALL: 0,
  VERBOSE: 1,
  DEBUG: 2,
  INFO: 3,
  WARN: 4,
  ERROR: 5,
  NONE: 6,
}

export const diag = {
  setLogger() {},
}

export const context = {
  active() {
    return {}
  },
  with(_ctx, fn, thisArg, ...args) {
    return fn.apply(thisArg, args)
  },
}

export const trace = {
  getTracer() {
    if (tracerProvider && typeof tracerProvider.getTracer === 'function') {
      return tracerProvider.getTracer()
    }
    return new NoopTracer()
  },
  getActiveSpan() {
    return activeSpan
  },
  setSpan(ctx, span) {
    activeSpan = span
    return ctx
  },
  setGlobalTracerProvider(provider) {
    tracerProvider = provider
  },
}
