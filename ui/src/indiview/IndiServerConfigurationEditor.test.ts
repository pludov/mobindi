import { hasHiddenConfiguration, proposeDeviceId } from './IndiServerConfigurationEditor';
import { IndiDeviceConfiguration } from '@bo/BackOfficeStatus';

describe('IndiServerConfigurationEditor', () => {
    it('proposes an unused driver name and adds numeric suffixes for collisions', () => {
        expect(proposeDeviceId('indi_driver', {})).toBe('indi_driver');
        expect(proposeDeviceId('indi_driver', {
            indi_driver: {driver: 'indi_driver', options: {}},
            'indi_driver-2': {driver: 'other', options: {}},
        })).toBe('indi_driver-3');
    });

    it('does not warn for an empty options object', () => {
        expect(hasHiddenConfiguration({driver: 'indi_driver', options: {}})).toBe(false);
    });

    it('warns when any hidden field or option is explicitly set', () => {
        const configurations: IndiDeviceConfiguration[] = [
            {driver: 'indi_driver', config: '', options: {}},
            {driver: 'indi_driver', skeleton: 'skeleton.xml', options: {}},
            {driver: 'indi_driver', prefix: 'prefix', options: {}},
            {driver: 'indi_driver', options: {autoConnect: false}},
        ];

        for (const configuration of configurations) {
            expect(hasHiddenConfiguration(configuration)).toBe(true);
        }
    });
});
