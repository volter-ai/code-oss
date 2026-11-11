import { DisposableStore } from '../../../../base/common/lifecycle.js';
import type { ITerminalService } from '../../terminal/browser/terminal.js';

/** Copy xterm's WebGL pixels before the browser clears its drawing buffer. */
export function terminalCanvasFrame(terminals: ITerminalService, canvas: HTMLCanvasElement): Promise<CanvasImageSource> | null {
	const terminal = terminals.instances.find(instance => instance.xterm?.raw.element?.contains(canvas))?.xterm;
	if (!terminal) { return null; }
	return new Promise((resolve, reject) => {
		const listeners = new DisposableStore();
		const finish = (error?: unknown, pixels?: HTMLCanvasElement) => {
			clearTimeout(timeout);
			listeners.dispose();
			if (pixels) { resolve(pixels); }
			else { reject(error); }
		};
		const timeout = setTimeout(() => finish(new Error('The terminal did not render its capture frame within five seconds.')), 5000);
		listeners.add(terminal.onDidDispose(() => finish(new Error('The terminal closed before its capture frame rendered.'))));
		listeners.add(terminal.raw.onRender(() => {
			try {
				const pixels = canvas.ownerDocument.createElement('canvas');
				pixels.width = canvas.width;
				pixels.height = canvas.height;
				const context = pixels.getContext('2d');
				if (!context) { throw new Error('No 2D context is available for the terminal capture.'); }
				context.drawImage(canvas, 0, 0);
				finish(undefined, pixels);
			} catch (error) { finish(error); }
		}));
		try { terminal.raw.refresh(0, terminal.raw.rows - 1); }
		catch (error) { finish(error); }
	});
}
