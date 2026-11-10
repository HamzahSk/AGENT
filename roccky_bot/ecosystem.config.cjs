module.exports = {
  apps: [
    {
      name: "index",
      script: "index.js",
      interpreter: "bun",
      watch: false,
      kill_timeout: 20000,
      exp_backoff_restart_delay: 1000,
      stop_exit_codes: [0, 78],
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