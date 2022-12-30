module.exports = {
    app: {
        port: process.env.APPLICATION_PORT || 8082,
        env: process.env.NODE_ENV || "production",
    },
    fluentd: {
        enabled: process.env.FLUENTD_ENABLED || false,
        host: process.env.FLUENTD_HOST || 'localhost',
        port: process.env.FLUENTD_PORT || 24224,
        timeout: process.env.FLUENTD_TIMEOUT || 3000,
    },
    es: {
        host: process.env.ES_HOST || 'localhost',
        port: process.env.ES_PORT || 9200,
        logsIndexName: process.env.ES_LOGS_INDEX_NAME || 'runtime-logs'
    },
    service: {
        functionsApiServiceUrl: process.env.FUNCTIONS_API_SERVICE_URL || 'http://localhost:8080/'
    }
};