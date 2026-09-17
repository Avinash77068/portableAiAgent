const fs = require('node:fs')

const GGUF_MAGIC = 0x46554747

// GGUF metadata value type ids (see the GGUF spec in ggml.h).
const TYPE_UINT8 = 0
const TYPE_INT8 = 1
const TYPE_UINT16 = 2
const TYPE_INT16 = 3
const TYPE_UINT32 = 4
const TYPE_INT32 = 5
const TYPE_FLOAT32 = 6
const TYPE_BOOL = 7
const TYPE_STRING = 8
const TYPE_ARRAY = 9
const TYPE_UINT64 = 10
const TYPE_INT64 = 11
const TYPE_FLOAT64 = 12

const FIXED_TYPE_SIZES = { [TYPE_UINT8]: 1, [TYPE_INT8]: 1, [TYPE_UINT16]: 2, [TYPE_INT16]: 2, [TYPE_UINT32]: 4, [TYPE_INT32]: 4, [TYPE_FLOAT32]: 4, [TYPE_BOOL]: 1, [TYPE_UINT64]: 8, [TYPE_INT64]: 8, [TYPE_FLOAT64]: 8 }

// A forward-only cursor over a file, buffering chunks as needed. GGUF metadata
// (including large tokenizer vocab arrays) can span several MB, but we only
// ever need to READ past it, not hold it all in memory - see skipValue below.
class FileCursor {
  constructor(fd) {
    this.fd = fd
    this.position = 0
    this.bufferStart = 0
    this.buffer = Buffer.alloc(0)
  }

  ensure(size) {
    if (this.position + size <= this.bufferStart + this.buffer.length) return
    const readSize = Math.max(8 * 1024 * 1024, size + 1024)
    const nextBuffer = Buffer.alloc(readSize)
    const bytesRead = fs.readSync(this.fd, nextBuffer, 0, readSize, this.position)
    this.buffer = nextBuffer.subarray(0, bytesRead)
    this.bufferStart = this.position
    if (bytesRead < size) throw new Error('Unexpected end of file while reading GGUF metadata')
  }

  readBytes(size) {
    this.ensure(size)
    const offset = this.position - this.bufferStart
    const slice = this.buffer.subarray(offset, offset + size)
    this.position += size
    return slice
  }

  skip(size) {
    this.position += size
  }

  readUint32() { return this.readBytes(4).readUInt32LE(0) }
  readInt32() { return this.readBytes(4).readInt32LE(0) }
  readUint64() { return this.readBytes(8).readBigUInt64LE(0) }

  readString() {
    const length = Number(this.readUint64())
    return this.readBytes(length).toString('utf8')
  }
}

const skipValue = (cursor, type) => {
  if (type === TYPE_STRING) {
    cursor.skip(Number(cursor.readUint64()))
    return
  }
  if (type === TYPE_ARRAY) {
    const elementType = cursor.readUint32()
    const length = Number(cursor.readUint64())
    for (let index = 0; index < length; index += 1) skipValue(cursor, elementType)
    return
  }
  const size = FIXED_TYPE_SIZES[type]
  if (size === undefined) throw new Error(`Unknown GGUF value type ${type}`)
  cursor.skip(size)
}

const readScalarValue = (cursor, type) => {
  if (type === TYPE_UINT8) return cursor.readBytes(1).readUInt8(0)
  if (type === TYPE_INT8) return cursor.readBytes(1).readInt8(0)
  if (type === TYPE_UINT16) return cursor.readBytes(2).readUInt16LE(0)
  if (type === TYPE_INT16) return cursor.readBytes(2).readInt16LE(0)
  if (type === TYPE_UINT32) return cursor.readUint32()
  if (type === TYPE_INT32) return cursor.readInt32()
  if (type === TYPE_FLOAT32) return cursor.readBytes(4).readFloatLE(0)
  if (type === TYPE_BOOL) return cursor.readBytes(1).readUInt8(0) !== 0
  if (type === TYPE_STRING) return cursor.readString()
  if (type === TYPE_UINT64) return Number(cursor.readUint64())
  if (type === TYPE_INT64) return Number(cursor.readBytes(8).readBigInt64LE(0))
  if (type === TYPE_FLOAT64) return cursor.readBytes(8).readDoubleLE(0)
  throw new Error(`Unsupported scalar GGUF type ${type}`)
}

// Reads just enough of a .gguf file's header to learn its transformer shape -
// no tensor data is touched. Returns null (never throws) if the file isn't a
// readable GGUF or is missing the fields needed for a KV-cache size estimate.
const readModelArchInfo = (filePath) => {
  let fd
  try {
    fd = fs.openSync(filePath, 'r')
  } catch {
    return null
  }

  try {
    const cursor = new FileCursor(fd)
    if (cursor.readUint32() !== GGUF_MAGIC) return null
    cursor.skip(4) // version
    cursor.skip(8) // tensor_count
    const kvCount = Number(cursor.readUint64())

    const metadata = {}
    for (let index = 0; index < kvCount; index += 1) {
      const key = cursor.readString()
      const type = cursor.readUint32()
      if (type === TYPE_ARRAY) {
        skipValue(cursor, type)
      } else {
        metadata[key] = readScalarValue(cursor, type)
      }
    }

    const architecture = metadata['general.architecture']
    if (typeof architecture !== 'string') return null

    const nLayer = Number(metadata[`${architecture}.block_count`])
    const nEmbd = Number(metadata[`${architecture}.embedding_length`])
    const nHead = Number(metadata[`${architecture}.attention.head_count`])
    const nHeadKV = Number(metadata[`${architecture}.attention.head_count_kv`] ?? nHead)
    const nativeContextLength = Number(metadata[`${architecture}.context_length`]) || null

    if (!nLayer || !nEmbd || !nHead) return null

    return { architecture, nLayer, nEmbd, nHead, nHeadKV: nHeadKV || nHead, nativeContextLength }
  } catch {
    return null
  } finally {
    fs.closeSync(fd)
  }
}

module.exports = { readModelArchInfo }
