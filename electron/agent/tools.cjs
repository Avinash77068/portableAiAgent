const { listTree, readFile, searchFiles } = require('./fileTools.cjs')
const { searchWeb } = require('../ai/webSearch.cjs')

const formatWebResults = (results) => results.length === 0
  ? '(no results)'
  : results.map((result, index) => `${index + 1}. ${result.title}\n${result.snippet}\n(${result.url})`).join('\n\n')

const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and folders inside the granted repository, optionally under a subfolder.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Subfolder to list, relative to the repo root. Use "." for the root.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a text file inside the granted repository.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path relative to the repo root.' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for a text string across files in the granted repository. Returns matching file:line snippets.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Text to search for.' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the public web. Use this only when something cannot be understood from the repository alone - an unfamiliar error message, an API/library you do not recognize, or a convention that is not explained by the code itself. Always cross-check results against the actual files in this repo before acting on them; never apply a found suggestion as-is without verifying it fits this codebase.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Search query.' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Propose replacing the full contents of a file inside the granted repository with new content. Shown to the user as a diff before it is applied, unless auto-apply is enabled. Always read_file first.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the repo root.' },
          content: { type: 'string', description: 'The full new content of the file.' },
        },
        required: ['path', 'content'],
      },
    },
  },
]

const executeReadOnlyTool = async (repoRoot, name, args) => {
  if (name === 'list_files') return listTree(repoRoot, args.path ?? '.').join('\n') || '(empty folder)'
  if (name === 'read_file') return readFile(repoRoot, args.path)
  if (name === 'search_files') return searchFiles(repoRoot, args.query).join('\n') || '(no matches)'
  if (name === 'web_search') return formatWebResults(await searchWeb(args.query))
  return null
}

module.exports = { TOOL_SCHEMAS, executeReadOnlyTool }
