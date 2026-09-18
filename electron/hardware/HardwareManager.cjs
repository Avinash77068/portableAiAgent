const os = require('node:os')
const { calculateMemoryPressure, calculatePerformanceProfile, calculateRecommendedThreads, getRecommendedAIConfig, getModelAwareAIConfig } = require('./performanceProfile.cjs')

const getPhysicalCoreCount = () => {
  try {
    const cpuInfo = os.cpus()
    const physicalIds = new Set()
    for (const cpu of cpuInfo) {
      const match = `${cpu.model} ${cpu.speed}`.match(/physical id[:= ]+(\d+)/i)
      if (match) physicalIds.add(match[1])
    }
    return physicalIds.size > 0 ? physicalIds.size : null
  } catch {
    return null
  }
}

const getPlatformName = (platform) => {
  if (platform === 'win32') return 'Windows'
  if (platform === 'darwin') return 'macOS'
  if (platform === 'linux') return 'Linux'
  return platform
}

const detectHardware = () => {
  const cpuInfo = (() => {
    try { return os.cpus() } catch { return [] }
  })()
  const totalRamBytes = (() => {
    try { return os.totalmem() } catch { return 0 }
  })()
  const freeRamBytes = (() => {
    try { return os.freemem() } catch { return 0 }
  })()
  const availableRamBytes = freeRamBytes
  const logicalCores = cpuInfo.length || 0
  const platform = process.platform
  const performanceProfile = calculatePerformanceProfile(totalRamBytes)
  const recommendedThreads = calculateRecommendedThreads(logicalCores)

  const hardwareInfo = {
    platform: getPlatformName(platform),
    platformId: platform,
    osVersion: (() => {
      try { return os.release() } catch { return 'Unknown' }
    })(),
    architecture: process.arch,
    cpuModel: cpuInfo[0]?.model || 'Unknown',
    physicalCores: getPhysicalCoreCount(),
    logicalCores,
    totalRamBytes,
    freeRamBytes,
    availableRamBytes,
    performanceProfile,
    recommendedThreads,
    memoryPressure: calculateMemoryPressure(totalRamBytes, availableRamBytes),
  }

  return {
    ...hardwareInfo,
    recommendedAIConfig: getRecommendedAIConfig(hardwareInfo),
  }
}

let hardwareSnapshot = null

const initializeHardware = () => {
  if (!hardwareSnapshot) {
    try {
      hardwareSnapshot = detectHardware()
    } catch {
      hardwareSnapshot = {
        platform: process.platform,
        platformId: process.platform,
        osVersion: 'Unknown',
        architecture: process.arch,
        cpuModel: 'Unknown',
        physicalCores: null,
        logicalCores: 0,
        totalRamBytes: 0,
        freeRamBytes: 0,
        availableRamBytes: 0,
        performanceProfile: 'LOW_RAM',
        recommendedThreads: 1,
        memoryPressure: 'normal',
        recommendedAIConfig: {
          contextLength: 4096,
          maxOutputTokens: 2048,
          temperature: 0.7,
          recommendedThreads: 1,
          gpuLayers: 0,
        },
      }
    }
  }
  return hardwareSnapshot
}

// Hardware facts (RAM, CPU) are cached for the app's lifetime since they don't
// change at runtime, but the AI config depends on which model is selected, so
// it's computed fresh here rather than baked into that cached snapshot.
const computeAIConfig = (selectedModel) => getModelAwareAIConfig(initializeHardware(), selectedModel)

module.exports = { initializeHardware, computeAIConfig }
