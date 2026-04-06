const noopLogger = {
  emit() {},
}

let loggerProvider = null

export const logs = {
  getLogger() {
    if (loggerProvider && typeof loggerProvider.getLogger === 'function') {
      return loggerProvider.getLogger()
    }
    return noopLogger
  },
  setGlobalLoggerProvider(provider) {
    loggerProvider = provider
  },
}
