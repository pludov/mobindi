import { describe, expect, it } from '@jest/globals';
import React from 'react';
import MiniMap from './MiniMap';
import UniformBackground from './UniformBackground';
import ComplexBackground from './ComplexBackground';
import SkyOverlay from './SkyOverlay';
import ScopeMarker from './ScopeMarker';
import Marker from './Marker';
import { ScopePanel } from '../MountPanel';
import { ScopePositionSelector } from '../Wizard/PolarAlignment/ScopePositionSelector';

function findMiniMap(node: React.ReactNode): React.ReactElement | undefined {
    if (!React.isValidElement(node)) return undefined;
    if (node.type === MiniMap) return node;
    for (const child of React.Children.toArray(node.props.children)) {
        const found = findMiniMap(child);
        if (found) return found;
    }
    return undefined;
}

describe('minimap sky layer integration', () => {
    it('places the mount sky between the background and scope marker', () => {
        const tree = new ScopePanel({ currentScope: 'mount' }).render();
        const map = findMiniMap(tree)!;
        const children = React.Children.toArray(map.props.children).filter(React.isValidElement) as React.ReactElement[];
        expect(children.map(child => child.type)).toEqual([UniformBackground, SkyOverlay, ScopeMarker]);
        expect(children[1].props.device).toBe('mount');
    });

    it('keeps the polar-alignment background and step markers around the sky layer', () => {
        const tree = new ScopePositionSelector({
            currentScope: 'mount', moveAllowed: false,
            gradient: [['red']], scopeAltAz: undefined, steps: [{ alt: 45, az: 90 }],
        }).render();
        const map = findMiniMap(tree)!;
        const children = React.Children.toArray(map.props.children).filter(React.isValidElement) as React.ReactElement[];
        expect(children.map(child => child.type)).toEqual([ComplexBackground, SkyOverlay, Marker, ScopeMarker]);
        expect(children[1].props.device).toBe('mount');
    });
});
