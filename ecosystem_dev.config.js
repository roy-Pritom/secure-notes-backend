module.exports = {
    apps: [
        {
            script: "./dist/main.js",
            watch: false,
            exec_mode: "cluster",
            name: "[STAGE] Secure Note - API",
            cwd: __dirname,
            instances: "1",
            max_memory_restart: "800M",
            autorestart: true,
            env: {
                NODE_ENV: "staging",
                PORT: 8086,
            },
        },
    ],
};



