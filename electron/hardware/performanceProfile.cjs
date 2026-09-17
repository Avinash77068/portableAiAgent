const { readModelArchInfo } = require('../model/ggufMetadata.cjs')

const GIB = 1024 ** 3
const KV_CACHE_BYTES_PER_ELEMENT = 2 // llama.cpp's default F16 KV cache
const RAM_FRACTION_FOR_MODEL = 0.5 // model weights + KV cache together may claim at most half of total RAM
const FIXED_OVERHEAD_BYTES = 0.5 * GIB // compute buffers, OS, and the rest of the app
const MIN_CONTEXT_LENGTH = 2048
const ABSOLUTE_MAX_CONTEXT_LENGTH = 65536 // defensive ceiling in case metadata reports something implausible

const calculateRecommendedThreads = (logicalCpuCount) => {
  const logicalCpus = Number.isFinite(logicalCpuCount) && logicalCpuCount > 0 ? Math.floor(logicalCpuCount) : 2

  if (logicalCpus <= 4) return Math.max(1, Math.floor(logicalCpus / 2))
  if (logicalCpus <= 8) return Math.min(4, Math.max(2, Math.floor(logicalCpus / 2)))
  if (logicalCpus <= 16) return Math.min(8, Math.max(4, logicalCpus - 4))
  return Math.min(10, Math.max(6, logicalCpus - 8))
}

const calculateMemoryPressure = (totalRamBytes, availableRamBytes) => {
  if (!totalRamBytes || availableRamBytes === null || availableRamBytes === undefined) return 'normal'
  const availableRatio = availableRamBytes / totalRamBytes
  if (availableRatio < 0.15) return 'high'
  if (availableRatio < 0.3) return 'moderate'
  return 'normal'
}

const calculatePerformanceProfile = (totalRamBytes) => {
  if (!totalRamBytes || totalRamBytes <= 8 * GIB) return 'LOW_RAM'
  if (totalRamBytes < 32 * GIB) return 'BALANCED'
  return 'HIGH_PERFORMANCE'
}

const getRecommendedAIConfig = (hardwareInfo) => {
  if (hardwareInfo.performanceProfile === 'HIGH_PERFORMANCE') {
    return {
      contextLength: 16384,
      maxOutputTokens: 6144,
      temperature: 0.7,
      recommendedThreads: hardwareInfo.recommendedThreads,
      gpuLayers: 'auto',
    }
  }

  if (hardwareInfo.performanceProfile === 'BALANCED') {
    return {
      contextLength: 8192,
      maxOutputTokens: 3072,
      temperature: 0.7,
      recommendedThreads: hardwareInfo.recommendedThreads,
      gpuLayers: 0,
    }
  }

  return {
    contextLength: 4096,
    maxOutputTokens: 2048,
    temperature: 0.7,
    recommendedThreads: hardwareInfo.recommendedThreads,
    gpuLayers: 0,
  }
}

// Sizes the context window from the SPECIFIC selected model's real architecture
// (read from its GGUF header) and this machine's total RAM, instead of a fixed
// per-tier guess - a 3B model's KV cache costs more per token than a 1.5B one,
// so "as much context as the system can take" depends on which model is loaded.
const getModelAwareAIConfig = (hardwareInfo, selectedModel) => {
  const fallback = getRecommendedAIConfig(hardwareInfo)
  if (!selectedModel?.path) return fallback

  const archInfo = readModelArchInfo(selectedModel.path)
  if (!archInfo) return fallback

  const headDim = archInfo.nEmbd / archInfo.nHead
  const bytesPerToken = 2 * archInfo.nLayer * archInfo.nHeadKV * headDim * KV_CACHE_BYTES_PER_ELEMENT
  if (!Number.isFinite(bytesPerToken) || bytesPerToken <= 0) return fallback

  const modelWeightBytes = selectedModel.size ?? 0
  const ramBudget = hardwareInfo.totalRamBytes * RAM_FRACTION_FOR_MODEL
  const kvBudgetBytes = ramBudget - modelWeightBytes - FIXED_OVERHEAD_BYTES
  if (kvBudgetBytes <= 0) return fallback

  const maxByRam = Math.floor(kvBudgetBytes / bytesPerToken)
  const nativeMax = archInfo.nativeContextLength && archInfo.nativeContextLength > 0 ? archInfo.nativeContextLength : ABSOLUTE_MAX_CONTEXT_LENGTH
  const contextLength = Math.max(MIN_CONTEXT_LENGTH, Math.min(maxByRam, nativeMax, ABSOLUTE_MAX_CONTEXT_LENGTH))

  return { ...fallback, contextLength }
}

module.exports = {
  calculateRecommendedThreads,
  calculateMemoryPressure,
  calculatePerformanceProfile,
  getRecommendedAIConfig,
  getModelAwareAIConfig,
}
