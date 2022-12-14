module.exports = {
    app: {
        port: process.env.APPLICATION_PORT || 8082,
        env: process.env.NODE_ENV || "production",
        key: process.env.APPLICATION_KEY,
    },
    fluentd: {
        host: process.env.FLUENTD_HOST || 'localhost',
        port: process.env.FLUENTD_PORT || 24224,
        timeout: process.env.FLUENTD_TIMEOUT || 3000,
    },
    service: {
        functionsApiServiceUrl: 'http://localhost:8080/'
    }
};