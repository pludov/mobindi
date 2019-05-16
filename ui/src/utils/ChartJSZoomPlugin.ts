
let loadedPlugins: object[] = [];
export function init() {
    const chartjszoomplugin = require("chartjs-plugin-zoom");
    const Chart = require("chart.js");
    Chart.plugins.unregister(chartjszoomplugin);
    loadedPlugins = [chartjszoomplugin];
}

export function plugins(): object[] {
    return loadedPlugins;
}