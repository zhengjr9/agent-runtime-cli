class Resource {
  constructor(attributes = {}) {
    this.attributes = attributes
  }

  merge(other) {
    return new Resource({
      ...this.attributes,
      ...(other?.attributes || {}),
    })
  }
}

function detector() {
  return {
    detect() {
      return new Resource({})
    },
  }
}

export function resourceFromAttributes(attributes = {}) {
  return new Resource(attributes)
}

export const envDetector = detector()
export const hostDetector = detector()
export const osDetector = detector()
