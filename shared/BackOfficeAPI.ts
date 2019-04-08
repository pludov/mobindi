

export type ToolExecuterApi = {
    $api_startTool: (message:{uid: string})=>void;
}


export type BackOfficeAPI = {
    toolExecuter: ToolExecuterApi;
}