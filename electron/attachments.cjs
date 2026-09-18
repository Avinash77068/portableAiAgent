const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const pdfParse = require('pdf-parse')
const { resolvePortableRoot } = require('./database/database.cjs')

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const allowedTextExtensions = new Set(['.txt', '.md', '.js', '.ts', '.tsx', '.jsx', '.json', '.html', '.css', '.py'])
const allowedImageTypes = new Map([['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp']])
const getDirectory = () => path.join(resolvePortableRoot(), 'data', 'attachments')

const validateSource = ({ name, type, size, sourcePath }) => {
  if (typeof name !== 'string' || typeof type !== 'string' || !Number.isInteger(size) || size <= 0 || size > MAX_ATTACHMENT_BYTES) throw new Error('Attachment is too large or invalid.')
  if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)) throw new Error('Attachment path is invalid.')
  const extension = path.extname(name).toLowerCase()
  const imageType = allowedImageTypes.get(extension)
  if (extension !== '.pdf' && !allowedTextExtensions.has(extension) && !imageType) throw new Error('Unsupported file format.')
  if (extension === '.pdf' && type !== 'application/pdf') throw new Error('Unsupported PDF format.')
  if (imageType && type !== imageType) throw new Error('Unsupported image format.')
  let stats
  try { stats = fs.statSync(sourcePath) } catch { throw new Error('Attachment could not be read.') }
  if (!stats.isFile() || stats.size !== size || stats.size > MAX_ATTACHMENT_BYTES) throw new Error('Attachment is too large or invalid.')
  return { extension, imageType, buffer: fs.readFileSync(sourcePath) }
}

const saveAttachment = (payload) => {
  const { name, type } = payload
  const { extension, imageType, buffer } = validateSource(payload)
  const id = randomUUID()
  fs.mkdirSync(getDirectory(), { recursive: true })
  fs.writeFileSync(path.join(getDirectory(), `${id}${extension}`), buffer, { flag: 'wx' })
  return { id, name, mimeType: type, size: buffer.length, isImage: Boolean(imageType) }
}

const resolveAttachment = (id) => {
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Attachment is invalid.')
  const fileName = fs.readdirSync(getDirectory()).find((entry) => entry.startsWith(`${id}.`))
  if (!fileName) throw new Error('Attachment was not found.')
  const extension = path.extname(fileName).toLowerCase()
  const imageType = allowedImageTypes.get(extension)
  const buffer = fs.readFileSync(path.join(getDirectory(), fileName))
  if (imageType) return { isImage: true, mimeType: imageType, textContent: '' }
  return { isImage: false, mimeType: extension === '.pdf' ? 'application/pdf' : 'text/plain', textContent: extension === '.pdf' ? null : buffer.toString('utf8'), buffer }
}

const extractAttachmentText = async (attachment) => {
  if (attachment.isImage) return attachment
  const textContent = attachment.textContent ?? (await pdfParse(attachment.buffer)).text
  if (!textContent.trim()) throw new Error('Attachment does not contain readable text.')
  return { ...attachment, textContent: textContent.slice(0, 12000) }
}

module.exports = { saveAttachment, resolveAttachment, extractAttachmentText }
