import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SkyOverlay } from './SkyOverlay';
import { SkyProjector } from './projection';

describe('sky overlay lifecycle', () => {
    let hidden = false;
    let project: jest.SpiedFunction<SkyProjector['project']>;

    beforeEach(() => {
        jest.useFakeTimers();
        hidden = false;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
        project = jest.spyOn(SkyProjector.prototype, 'project').mockReturnValue({ lines: '', stars: ['', '', ''] });
    });

    afterEach(() => {
        project.mockRestore();
        jest.useRealTimers();
        delete (document as { hidden?: boolean }).hidden;
    });

    it('refreshes for elapsed time and cumulative large location changes, not unrelated updates', () => {
        const view = render(<SkyOverlay device="mount" lat={0} long={0} />);
        expect(project).toHaveBeenCalledTimes(1);
        view.rerender(<SkyOverlay device="mount" lat={0.1} long={0} />);
        view.rerender(<SkyOverlay device="mount" lat={0.2} long={0} />);
        expect(project).toHaveBeenCalledTimes(1);
        view.rerender(<SkyOverlay device="mount" lat={0.26} long={0} />);
        expect(project).toHaveBeenCalledTimes(2);
        view.rerender(<SkyOverlay device="other" lat={0.26} long={0} />);
        expect(project).toHaveBeenCalledTimes(2);
        act(() => { jest.advanceTimersByTime(60000); });
        expect(project).toHaveBeenCalledTimes(3);
        view.unmount();
        act(() => { jest.advanceTimersByTime(60000); });
        expect(project).toHaveBeenCalledTimes(3);
    });

    it('omits unavailable locations and suspends while hidden', () => {
        const view = render(<SkyOverlay device="mount" />);
        expect(screen.queryByTestId('sky-overlay')).toBeNull();
        act(() => { jest.advanceTimersByTime(120000); });
        expect(project).not.toHaveBeenCalled();
        view.rerender(<SkyOverlay device="mount" lat={20} long={10} />);
        expect(screen.getByTestId('sky-overlay')).toBeTruthy();
        expect(project).toHaveBeenCalledTimes(1);
        hidden = true;
        act(() => { document.dispatchEvent(new Event('visibilitychange')); });
        view.rerender(<SkyOverlay device="mount" lat={30} long={10} />);
        act(() => { jest.advanceTimersByTime(120000); });
        expect(project).toHaveBeenCalledTimes(1);
        hidden = false;
        act(() => { document.dispatchEvent(new Event('visibilitychange')); });
        expect(project).toHaveBeenCalledTimes(2);
        expect(project).toHaveBeenLastCalledWith({ lat: 30, long: 10 }, expect.any(Number));
        view.rerender(<SkyOverlay device="mount" lat={NaN} long={10} />);
        expect(screen.queryByTestId('sky-overlay')).toBeNull();
        act(() => { jest.advanceTimersByTime(60000); });
        expect(project).toHaveBeenCalledTimes(2);
        view.unmount();
    });
});
