const net = require('node:net')

const findAvailablePort = (preferredPort = 39281) => new Promise((resolve, reject) => {
  const listen = (port) => {
    const server = net.createServer()
    server.once('error', () => {
      if (port !== 0) {
        listen(0)
        return
      }
      reject(new Error('No available localhost port'))
    })
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      const selectedPort = typeof address === 'object' && address ? address.port : port
      server.close(() => resolve(selectedPort))
    })
  }

  listen(preferredPort)
})

module.exports = { findAvailablePort }
