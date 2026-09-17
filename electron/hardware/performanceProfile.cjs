const GIB = 1024 ** 3

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
      contextLength: 8192,
      maxOutputTokens: 4096,
      temperature: 0.7,
      recommendedThreads: hardwareInfo.recommendedThreads,
      gpuLayers: 'auto',
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

module.exports = {
  calculateRecommendedThreads,
  calculateMemoryPressure,
  calculatePerformanceProfile,
  getRecommendedAIConfig,
}
