const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
    app.use(createProxyMiddleware("/notification", {
        "target": "ws://127.0.0.1:8080/",
        "ws": true
    }));
    app.use(createProxyMiddleware("/fitsviewer", {
        "target": "http://127.0.0.1:8080/"
    }));
}