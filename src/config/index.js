module.exports = {
    app: {
        port: process.env.APPLICATION_PORT || 8082,
        env: process.env.NODE_ENV || "production",
    },
    fluentd: {
        host: process.env.FLUENTD_HOST || 'localhost',
        port: process.env.FLUENTD_PORT || 24224,
        timeout: process.env.FLUENTD_TIMEOUT || 3000,
    },
    service: {
        functionsApiServiceUrl: process.env.FUNCTIONS_API_SERVICE_URL || 'http://localhost:8080/'
    }
};