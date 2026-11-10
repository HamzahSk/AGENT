module.exports = {
  apps: [
    {
      name: "index",
      script: "index.js",
      interpreter: "bun",
      watch: true,
      ignore_watch: [
        "session",
        "tmp",
        "temp",
        "node_modules",
        "logs",
        "storage",
        "database",
        "*.log",
        ".cache"
      ]
    }
  ]
}