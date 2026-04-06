function createPipeline() {
  return {
    async metadata() {
      return { width: 1, height: 1, format: 'png' }
    },
    resize() {
      return this
    },
    jpeg() {
      return this
    },
    png() {
      return this
    },
    webp() {
      return this
    },
    async toBuffer() {
      return Buffer.alloc(0)
    },
  }
}

export default function sharp() {
  return createPipeline()
}
