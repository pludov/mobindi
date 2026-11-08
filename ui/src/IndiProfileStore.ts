import { IndiProfilesConfiguration } from '@bo/BackOfficeStatus';
import * as Store from "./Store";
import * as Utils from './Utils';


import ArrayReselect from './utils/ArrayReselect';



export function getProfileList() : (store: Store.Content) => Array<{uid: string, title: string}> {
    const mapFromProfiles = ArrayReselect.arraySelectorCreator([(profiles: IndiProfilesConfiguration|undefined)=> {
        let result : Array<{uid: string, title: string}> = [];
        for(const uid of profiles?.list || []) {
            const title = profiles!.byUid[uid].name;
            result.push({uid, title});
        }
        return result;
    }], a=>a);

    return (store: Store.Content) => {
        const profiles = store.backend.indiManager?.configuration?.profiles;

        return mapFromProfiles(profiles);
    }
}

export function getExclusionGroupPotentialPeers(): (store: Store.Content, uid: string) => Array<{uid: string, title: string}> {
    const profileList = getProfileList();

    const filter = ArrayReselect.arraySelectorCreator(
        [(profiles: ReturnType<ReturnType<typeof getProfileList>>, uid: string) => profiles.filter(e=>e.uid !== uid)],
        a=>a);


    return (store: Store.Content, uid: string) => {
        return filter(profileList(store), uid);
    }
}


export function getProfileExclusionGroup() : (store: Store.Content, uid: string) => Array<string>{
    const mapFromProfiles = ArrayReselect.arraySelectorCreator([(profiles: IndiProfilesConfiguration|undefined, uid: string)=> {
        if (profiles === undefined) return [];

        let profile =  Utils.getOwnProp(profiles.byUid, uid);

        if (profile === undefined) return [];

        const profileExclusionGroup = profile.exclusionGroup;

        if (profileExclusionGroup === null) return [];

        const exclusionGroupPeersSet = [];
        for (const [k,v] of Object.entries(profiles!.byUid)) {
            if (k !== uid && v.exclusionGroup === profileExclusionGroup) {
                exclusionGroupPeersSet.push(k);
            }
        }
        console.log('exclusionGroupPeersSet', exclusionGroupPeersSet);
        return exclusionGroupPeersSet.sort();
    }], a=>a);

    return (store: Store.Content, uid: string) => {
        const profiles = store.backend.indiManager?.configuration?.profiles;

        return mapFromProfiles(profiles, uid);
    }


}
