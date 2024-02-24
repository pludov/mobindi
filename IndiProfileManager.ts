/**
 * Created by ludovic on 21/07/17.
 */
import Log from './Log';
import { ExpressApplication, AppContext } from "./ModuleBase";
import { IndiManagerStatus, BackofficeStatus, IndiProfileConfiguration } from './shared/BackOfficeStatus';
import JsonProxy, {  } from './shared/JsonProxy';
import CancellationToken from 'cancellationtoken';
import * as RequestHandler from "./RequestHandler";
import * as BackOfficeAPI from "./shared/BackOfficeAPI";
import { IdGenerator } from './IdGenerator';

const logger = Log.logger(__filename);

export default class IndiProfileManager implements RequestHandler.APIAppProvider<BackOfficeAPI.IndiProfileAPI>{
    app: ExpressApplication;
    appStateManager: JsonProxy<BackofficeStatus>;
    context: AppContext;
    indiManager: IndiManagerStatus;
    profileIdGenerator = new IdGenerator();

    constructor(app: ExpressApplication, appStateManager:JsonProxy<BackofficeStatus>, context: AppContext) {
        this.app = app;
        this.appStateManager = appStateManager;
        this.context = context;

        this.indiManager = appStateManager.getTarget().indiManager;

        this.appStateManager.addSynchronizer(['indiManager', 'configuration', 'profiles', 'list'], this.updateIdGenerator, true);
    }

    private readonly updateIdGenerator = () => {
        this.profileIdGenerator.used(this.indiManager.configuration.profiles.list);
    }

    readonly createProfile = async (ct: CancellationToken, payload: Partial<Omit<IndiProfileConfiguration, "keys"|"uid">>) => {
        const uid = this.profileIdGenerator.next();
        this.indiManager.configuration.profiles.list.push(uid);
        this.indiManager.configuration.profiles.byUid[uid] = {
            uid,
            name: "New profile",
            active: false,
            ...payload,
            keys: {},
        };
    };

    readonly deleteProfile = async (ct: CancellationToken, payload: { uid: string; }) => {
        const index = this.indiManager.configuration.profiles.list.indexOf(payload.uid);
        if (index >= 0) {
            this.indiManager.configuration.profiles.list.splice(index, 1);
            delete this.indiManager.configuration.profiles.byUid[payload.uid];
        }
    };

    readonly updateProfile = async (ct: CancellationToken, payload: Partial<Omit<IndiProfileConfiguration, "keys">> & {uid:string}) => {
        const profile = this.indiManager.configuration.profiles.byUid[payload.uid];
        if (!profile) {
            throw new Error("Profile not found");
        }
        if (payload.active !== undefined) {
            profile.active = payload.active;
        }
        if (payload.name !== undefined) {
            profile.name = payload.name;
        }
    }

    readonly getAPI: () => RequestHandler.APIAppImplementor<BackOfficeAPI.IndiProfileAPI> =() => {
        return {
            createProfile: this.createProfile,
            deleteProfile: this.deleteProfile,
            updateProfile: this.updateProfile
        }
    }
}