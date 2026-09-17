// Minimal LCS-based line diff - good enough for a reviewable before/after
// without pulling in a dependency. Falls back to a whole-file replace for
// very large files where the O(n*m) table would be too slow/heavy.
const MAX_CELLS = 4_000_000

const diffLines = (oldText, newText) => {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const oldLength = oldLines.length
  const newLength = newLines.length

  if (oldLength * newLength > MAX_CELLS) {
    return [
      ...oldLines.map((line) => ({ type: 'remove', line })),
      ...newLines.map((line) => ({ type: 'add', line })),
    ]
  }

  const lcs = Array.from({ length: oldLength + 1 }, () => new Array(newLength + 1).fill(0))
  for (let i = oldLength - 1; i >= 0; i -= 1) {
    for (let j = newLength - 1; j >= 0; j -= 1) {
      lcs[i][j] = oldLines[i] === newLines[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const rows = []
  let i = 0
  let j = 0
  while (i < oldLength && j < newLength) {
    if (oldLines[i] === newLines[j]) {
      rows.push({ type: 'context', line: oldLines[i] })
      i += 1
      j += 1
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ type: 'remove', line: oldLines[i] })
      i += 1
    } else {
      rows.push({ type: 'add', line: newLines[j] })
      j += 1
    }
  }
  while (i < oldLength) {
    rows.push({ type: 'remove', line: oldLines[i] })
    i += 1
  }
  while (j < newLength) {
    rows.push({ type: 'add', line: newLines[j] })
    j += 1
  }

  return rows
}

module.exports = { diffLines }
